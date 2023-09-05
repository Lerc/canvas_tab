"use strict"
var selectedExport;

if (location.pathname.includes("/page/")) {
  //don't init if not in the right path
  //this is to stop code running from comfyUI directly
  $(initPaint);
}

function cells(x=1,y=1) {
  let width = 1/x;
  let height = 1/y;
  return strokes => {
    let result = [];
    for (let tx = -1; tx<x; tx++) {
      for (let ty=-1; ty<y; ty++) {
        const cell = strokes.map( a=>a.map(
          function ({x,y}) {
            return {
              x:(x + tx*width),
              y:(y + ty*height),
            }
          }));
        result.push(...cell);
      }
    }
    return result;
  }

} 
function mirrorX(strokes) {
  return [...strokes, ...strokes.map( a=>a.map(({x,y})=>({x:1-x,y})))];
}
function mirrorY(strokes) {
  return [...strokes, ...strokes.map( a=>a.map(({x,y})=>({x,y:1-y})))];
}

function composeFunction(fnA,fnB) {
  return (...args)=>(fnB(fnA(...args)))
}

const mirrorXY = composeFunction(mirrorX,mirrorY);

CanvasRenderingContext2D.prototype.getAllImageData = function()  {
  return this.getImageData(0,0,this.canvas.width,this.canvas.height)
}

CanvasRenderingContext2D.prototype.setAllImageData = function(imageData)  {
  return this.putImageData(imageData,0,0)
}

var initialPalette = [
  "#000000","#ffffff",
  "#ff0000","#ff8000",
  "#ffff00","#008000",
  "#00ff00","#00ff80",
  "#0080ff","#50C0ff",
  "#0000ff","#8080ff",
  "#a00060","#ff00ff",
  "#ffa0a0","#a06040",
  "#606060","#a0a0a0"];

var tip = {
    lastX : 0,
    lastY : 0,
    x : 0.0,
    y : 0.0,
    color : "black",
    size : 5,
    drawOperation : feltTip,
  }


var pen=feltTip;

var brushSizeControl = brushDiameterControl("tip_diameter");

var picStack = [];

var activePic;

function setActivePic(newValue) {
  activePic=newValue;
  updateLayerList()
  if (!activePic) return;
  activePic.bringToFront();

}

var dragging = false;


var dragStartX;
var dragStartY;


function setExportPic(pic) {
  selectedExport=pic;
  
  $(".sidebutton").removeClass("output")
  const button=pic.element.querySelector(".sidebutton");
  button.classList.add("output");

  pic.commit();
  
  transmitMask(pic.mask.canvas);
}

function closePic(pic) {

  pic.element.parentElement.removeChild(pic.element);
  if (pic === activePic) {
    const newActive = document.querySelector("#workspace .pic");
    setActivePic(newActive.pic);
  }
}

var lastUsedMaskColor = "#402040";

class Layer {
  canvas = document.createElement("canvas");
  ctx = this.canvas.getContext("2d",{willReadFrequently:true});
  mask = false;
  visible = true;
  composite = "source-over";
  opacity = 1;
  _maskColor = lastUsedMaskColor;
  constructor (title, {width,height}, mask = false)  {
    this.canvas.width=width;
    this.canvas.height=height;
    this.mask = mask;
    this.title= title;
    if (mask) {
      this.composite="source-over";
    }
  }
  get maskColor() {
    return this._maskColor;
  }
  set maskColor(newValue) { 
    this._maskColor=newValue;
    if (this.mask) {
      this.ctx.save();
      this.ctx.globalCompositeOperation="source-atop"; 
      this.ctx.fillStyle=newValue;
      this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
      this.ctx.restore();
    }
  }
}

function blankCanvas(width=512, height=width, filled=true) {
  const canvas = document.createElement("canvas");
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext("2d");
  if (filled) {
    ctx.fillStyle="white";
    ctx.fillRect(0,0,width,height);
  }
  canvas.ctx=ctx;
  return canvas;
}

function circleImage(diameter) {
  console.log({diameter})
  const imageSize=(diameter+4)|0;
  let result = blankCanvas(imageSize,imageSize,false);
  result.ctx.arc(imageSize/2,imageSize/2,diameter/2,0,Math.PI*2);
  result.ctx.lineWidth=3;
  result.ctx.strokeStyle="#000";
  result.ctx.stroke();
  result.ctx.lineWidth=1;
  result.ctx.strokeStyle="#fff";
  result.ctx.stroke();
  return result;
}

function createDrawArea(canvas = blankCanvas()) {
  const undoDepth = 10;
  const element = document.createElement("div")
  const ctx=canvas.getContext("2d");
  const eventOverlay = document.createElement("div");
  const sidebar = document.createElement("div");
  const closeButton = document.createElement("div");
  var updatingStroke=false;
  sidebar.className = "sidebutton";
  closeButton.className = "closebutton";

  element.className="pic";
  eventOverlay.className="eventoverlay fillparent";

  element.appendChild(sidebar);
  element.appendChild(canvas);
  element.appendChild(eventOverlay);
  element.appendChild(closeButton);
  canvas.ctx=ctx;
  
  const activeOperationCanvas = document.createElement("canvas");
  activeOperationCanvas.width = canvas.width;
  activeOperationCanvas.height = canvas.height;
  activeOperationCanvas.ctx = activeOperationCanvas.getContext("2d",{willReadFrequently:true});
  

  const image = canvas.ctx.getAllImageData();
  const undo = [];
  const redo = [];
  const layers = [];

  layers.push( new Layer("base", canvas));
  const mask =new Layer("mask", canvas,true);
  layers.push(mask);
  
  layers[0].ctx.putImageData(image,0,0);
  activeOperationCanvas.ctx.putImageData(image,0,0);

  eventOverlay.addEventListener("mousedown", handleMouseDown);
  eventOverlay.addEventListener("mouseup", handleMouseUp);
  eventOverlay.addEventListener("mousemove", handleMouseMove);
  eventOverlay.addEventListener("contextmenu",function(e){e.preventDefault(); return false;});
 
  
  const result = {element,eventOverlay,image,layers,canvas,mask,
    scale:1,
    scalefactor:0,
    offsetX:0,
    offsetY:0,
    isDrawing:false,
    activeLayer:layers[0],
    strokeCoordinates :[], 
    strokeModifier: a=>a,
    setTransform( ) {
      const {element,scale,offsetX,offsetY} = this;
      element.style.setProperty("--scalefactor",scale)
      element.style.setProperty("--translateX",offsetX+"px")
      element.style.setProperty("--translateY",offsetY+"px")
      
      //var trans =`translate(${offsetX}px,${offsetY}px) scale(${scale},${scale})`;
      //$(element).css("transform",trans);
    },
    bringToFront() {
      const oldPos = picStack.indexOf(this);
      if (oldPos >= 0) {
        picStack.splice(oldPos,1);
      }
      picStack.unshift(this);
      let z = 100;
      for (const {element} of picStack) {
        element.style.zIndex=z;
        element.setAttribute("data-z",z);
        z-=1;
      }
    },

    composite(suppressMask=false) {
      canvas.ctx.save();
      canvas.ctx.clearRect(0,0,canvas.width,canvas.height)
      for (const layer of this.layers) {
        if (suppressMask && this.mask==layer) continue;
        if (!layer.visible) continue;        
        canvas.ctx.globalAlpha = layer.opacity;
        canvas.ctx.globalCompositeOperation=layer.composite;
        if (this.isDrawing && layer===this.activeLayer) {
          canvas.ctx.drawImage(activeOperationCanvas,0,0);          
        } else {
          canvas.ctx.drawImage(layer.canvas,0,0);

        }
      }
      canvas.ctx.restore();
    },

    commit() {
      let data = activeOperationCanvas.ctx.getAllImageData()
      const undoRecord = {
        layer: this.activeLayer,
        data: this.activeLayer.ctx.getAllImageData()
      }
      undo.push(undoRecord);
      if (undo.length > undoDepth) undo.shift();
      redo.length=0;

      this.activeLayer.ctx.putImageData(data,0,0);
      this.isDrawing = false;
      if (selectedExport===this) {
        if (this.activeLayer===this.mask) {
          transmitMask(this.mask.canvas);
        } else {
          this.composite(true);
          transmitCanvas(canvas);          
        }
        
      }
      if (activePic===this) {  
        updateLayerList();  //inefficient to remake all controls on edit,  fix this
      }
      this.updateVisualRepresentation();

    },

    updateVisualRepresentation(transmit=false) {
      this.composite();
      if (transmit && this===selectedExport) transmitCanvas(canvas);          
    },

    startDraw(x,y) {
      if (!this.activeLayer.visible) return; //don't draw on hidden layers.
      //let data = this.activeLayer.ctx.getAllImageData()
      //activeOperationCanvas.ctx.putImageData(data,0,0);
      this.isDrawing=true;
      this.strokeCoordinates=[{x:x+0.001,y}];
      tip.x=x;
      tip.y=y;
      this.draw(x,y);
    },

    stopDraw(x,y) {
      const self=this;
      if (updatingStroke) {
        setTimeout(_=>self.stopDraw(x,y),1)
      } else {
        this.isDrawing=false;
        this.commit();
      }
    },

    draw(x,y) {
      this.strokeCoordinates.push({x,y});      

      //This is done in a timeout to allow multiple draw movements
      //to accumulate rather than slowing things down
      if (!updatingStroke) {
        updatingStroke=true;
        setTimeout(_=>{
          activeOperationCanvas.ctx.clearRect(0,0,activeOperationCanvas.width,activeOperationCanvas.height);
          activeOperationCanvas.ctx.drawImage(this.activeLayer.canvas,0,0);
    
          const unitRange=this.strokeCoordinates.map(({x,y})=>({x:x/canvas.width,y:y/canvas.height}));

          const strokes = this.strokeModifier([unitRange])          
          for (const unitStroke of strokes) {
            const stroke=unitStroke.map(({x,y})=>({x:x*canvas.width,y:y*canvas.height}));
            tip.drawOperation(activeOperationCanvas.ctx,tip,stroke)
          }
          if (this.activeLayer.mask) {
            const ctx=activeOperationCanvas.ctx;
            ctx.save();
            ctx.globalCompositeOperation="source-atop";
            ctx.fillStyle = this.activeLayer.maskColor;
            ctx.fillRect(0,0,activeOperationCanvas.width,activeOperationCanvas.height);
            ctx.restore();
          }
          this.composite();
          updatingStroke=false;
        },1)
      }      
    },
    removeLayer(layer=this.activeLayer) {
      const i = layers.indexOf(layer);
      if (i !==-1) {
        layers.splice(i,1);
        if (layer === this.activeLayer) {
          this.activeLayer = layers[Math.min(layers.length-1,i)];
        }
      }
    },
    addEmptyLayer() {
      let result = new Layer("new layer", canvas)
      layers.push(result);
      return result;
    }
  }
  eventOverlay.pic = result;
  sidebar.addEventListener("mousedown",_=>  setExportPic(result))
  closeButton.addEventListener("click",_=>  closePic(result))

  result.setTransform();
  setActivePic(result)
  return result;
}



function initPaint(){ 
  var palette=$("#palette");
  for (let i of initialPalette) {
    const e=`<div class="paletteentry" style="background-color:${i}"> </div>`;
    palette.append($(e).data("colour",i));
  }
  palette.append($(`<div class="paletteentry erase">Erase</div>`).data("colour","#0000"))
  poulateLayerControl();
  $(".background")[0].addEventListener("wheel",handleMouseWheel);

  $(".paletteentry").on("mousedown", function(e) {
    if (![feltTip,pixelTip].includes(pen)) {
      pen=feltTip;
    }
    let eraser=false;
    let c= $(e.currentTarget).data("colour");
    if (c==="#0000") {
      c="#ffffff";
      eraser = true;
    } 
    if (e.which == 1) {
      $("#foreground").val(c).data("eraser",eraser);
    }
    if (e.which == 3) {
      $("#background").val(c).data("eraser",eraser);
    }

  }).on("contextmenu",
  function(){return false;}
  );




  $("#pixels").on("click",function(e) {pen=pixelTip;});
  $("#tip1").on("click",function(e) {tip.size=1; pen=feltTip; });
  $("#tip2").on("click",function(e) {tip.size=2; pen=feltTip;});
  $("#tip3").on("click",function(e) {tip.size=3; pen=feltTip;});
  $("#tip5").on("click",function(e) {tip.size=5; pen=feltTip;});
  $("#tip9").on("click",function(e) {tip.size=9; pen=feltTip;});
  $("#eraser").on("click",function(e) {tip.size=9; pen=eraserTip;});
  $("#fine_eraser").on("click",function(e) {tip.size=9; pen=pixelClear;});

  $(".pen.button").on("click", function(e) {
    $(".pen.button").removeClass("down");
    $(e.currentTarget).addClass("down");
    brushSizeControl.diameter=tip.size;
  });

  brushSizeControl.addEventListener("changed", e=> {
    tip.size=brushSizeControl.diameter;

    for (let p of $(".pic")) {
      updateBrushCursor(p);
    }

    
  });


  $(".panel").append(brushSizeControl)

  window.test1=createDrawArea();
  window.test2=createDrawArea();

  $("#workspace").append(test1.element);
  $("#workspace").append(test2.element);
    

  brushSizeControl.diameter=tip.size;

  setExportPic(test2);
}

function addNewImage(image) {
    console.log( `addNewImage(${image.width},${image.height})`)
    const target=blankCanvas(image.width,image.height)
    var ctx = target.getContext('2d');

    ctx.drawImage(image, 0, 0);
    
    let result =createDrawArea(target);
    $("#workspace").append(result.element);
    //transmitCanvas(target);
    return(result)
}

function addNewLayer(image) {
  if (!selectedExport) {
      setExportPic(addNewImage(image)); 
      return;
  } 
  let pic = selectedExport;
  if (pic.canvas.width === image.width && pic.canvas.height==image.height) {
    const layer = new Layer("generation",pic.canvas);
    layer.ctx.drawImage(image,0,0);    
    console.log("new layer", layer)
    console.log(layer.canvas.width, layer.canvas.height)
    pic.layers.push(layer);
    pic.activeLayer=layer;
    updateLayerList();
    pic.updateVisualRepresentation();
  }
}

function handleMouseDown(e) {
  //console.log("mousedown on pic",e);
  let pic = e.currentTarget.pic;
  setActivePic(pic);
  
  const maskLayer = activePic.activeLayer.mask

  
  switch (e.button) {
    case 0:      
      tip.drawOperation = $("#foreground").data("eraser")?eraserTip:pen;      
      tip.colour = maskLayer?"#000":$("#foreground").val();
      pic.startDraw(e.offsetX,e.offsetY);
      createCaptureOverlay(e.currentTarget)
      break;
    case 1:
      e.preventDefault();
      dragStartX=pic.offsetX;
      dragStartY=pic.offsetY;
      mouseDownX=e.clientX;
      mouseDownY=e.clientY;
      $(e.currentTarget.pic.element).css("transition" , "none");
      dragging = true;      
      createCaptureOverlay(e.currentTarget)

      break;
    case 2:
      tip.colour = $("#background").val();
      tip.drawOperation = (maskLayer || $("#background").data("eraser"))?eraserTip:pen;
      pic.startDraw(e.offsetX,e.offsetY);
      createCaptureOverlay(e.currentTarget)

      e.preventDefault();
      break;
  }
}
function handleMouseLeave(e) {
  const bounds=e.currentTarget.getBoundingClientRect();
  let pic = e.currentTarget.pic;
  if (dragging) {

    console.log("mouseleave on pic",e);
    let cx = e.pageX-bounds.left;
    let cy = e.pageY-bounds.top;
    console.log({cx,cy})

    if (e.buttons!==4) {
      stopDragging();
      return;
    }
    var dx = e.clientX-mouseDownX;
    var dy = e.clientY-mouseDownY;
    console.log({dx,dy})
    pic.offsetX=dragStartX+dx;
    pic.offsetY=dragStartY+dy;
    pic.setTransform();
  }

}

function handleMouseUp(e) {
  let pic = e.currentTarget.pic;
  activePic = pic;

  if (dragging) {
    if (e.buttons!==4) {
      stopDragging();
      removeCaptureOverlay();
      return;
    }
  }

  if (pic.isDrawing && e.buttons === 0) {
    removeCaptureOverlay();
    pic.stopDraw(e.offsetX,e.offsetY)
  }

}
function handleMouseMove(e) {
  let pic = e.currentTarget.pic;
  if (pic!==activePic) return;
  if (dragging) {
    if (e.buttons!==4) {
      stopDragging();
      removeCaptureOverlay();
      return;
    }
    var dx = e.clientX-mouseDownX;
    var dy = e.clientY-mouseDownY;
    pic.offsetX=dragStartX+dx;
    pic.offsetY=dragStartY+dy;
    //console.log({dx,dy});
    pic.setTransform();
  }
  
  if (pic.isDrawing && e.buttons === 0) {
    removeCaptureOverlay();
    pic.stopDraw(e.offsetX,e.offsetY)
  }
  if (pic.isDrawing) pic.draw(e.offsetX,e.offsetY);
}


  
function canvasPngAsBytes (canvas,callback) {
  function handleBlob(blob) {
    var reader = new FileReader();
    reader.onload = function () {	callback(this.result);	};
    reader.readAsArrayBuffer(blob);
  }
  canvas.toBlob(handleBlob);
}
  
function handleMouseWheel(e) {
  let direction = -Math.sign(e.deltaY);
  const scaleAround= {x:e.pageX,y:e.pageY};

  setScale(activePic.scalefactor+direction,scaleAround);
  activePic.setTransform();
}
  
function scalefactorToSize(n) {
  return (Math.pow(2,(n/2)));
}

function insideBounds(point,bounds) {
  if (!point) return false;
  return (point.x>bounds.x && point.y>bounds.y && point.x<bounds.right && point.y<bounds.bottom)
}
function setScale(newfactor, around) {
    const pic = activePic 
    const bounds = pic.element.getBoundingClientRect();
    const parentBounds = pic.element.offsetParent.getBoundingClientRect();
    const center = {x : bounds.x+bounds.width/2, y:bounds.y+bounds.width/2};
    if (!insideBounds(around,bounds)) around = center;
    const px = (around.x - bounds.left) /bounds.width;
    const py = (around.y - bounds.top) / bounds.height; 

    const newScale = scalefactorToSize(newfactor);
    const expectedWidth =  pic.element.clientWidth*newScale
    const expectedHeight =  pic.element.clientHeight*newScale



    const candidateX = around.x - expectedWidth *px - parentBounds.left;
    const candidateY = around.y - expectedHeight *py - parentBounds.top;

    pic.offsetX = candidateX
    pic.offsetY = candidateY

    pic.scale=newScale;
    pic.scalefactor=newfactor;
    pic.setTransform();
    updateBrushCursor(pic.element);
}
  
function pixelTip(ctx,penInfo,strokePath) {
  console.log(penInfo)
  ctx.fillStyle=penInfo.colour;
  for (let {x,y} of strokePath) {
    x=Math.floor(x-0.25);
    y=Math.floor(y-0.25);
    ctx.fillRect(x,y,1,1);
  };
}

function feltTip(ctx,penInfo,strokePath) {
  ctx.lineWidth=penInfo.size;
  ctx.strokeStyle=penInfo.colour;
  ctx.lineCap="round";
  ctx.lineJoin="round";
  ctx.beginPath();
  for (let {x,y} of strokePath) {
    ctx.lineTo(x,y);
  }
  ctx.stroke();
}
  
function eraserTip(ctx,penInfo,strokePath) {  
  ctx.save();
  ctx.lineWidth=penInfo.size;
  ctx.strokeStyle="white";
  ctx.lineCap="round";
  ctx.lineJoin="round";
  ctx.globalCompositeOperation="destination-out";

  ctx.beginPath();
  for (let {x,y} of strokePath) {
    ctx.lineTo(x,y);
  }
  ctx.stroke();

  ctx.restore();
}

function pixelClear(ctx,penInfo,strokePath) {
  let x=Math.floor(penInfo.x-0.25);
  let y=Math.floor(penInfo.y-0.25);
  ctx.clearRect(x,y,1,1);
  for (let {x,y} of strokePath) {
    x=Math.floor(x-0.25);
    y=Math.floor(y-0.25);
    ctx.clearRect(x,y,1,1);
  };
}


var mouseDownX=0;
var mouseDownY=0;
  
function stopDragging() {
  dragging=false;
  //console.log("stop dragging");
  $(activePic.element).css("transition" , "");
}


function containerToCanvas(canvas,clientX,clientY) {
  let canvasSpace= canvas.getBoundingClientRect();
  let scaleX=canvas.width/canvasSpace.width;
  let scaleY=canvas.height/canvasSpace.height;
  let x= (clientX-canvasSpace.x) * scaleX;
  let y= (clientY-canvasSpace.y) * scaleY;

  return {x,y};
}  

function brushDiameterControl(id="diameter") {
  const element = document.createElement("canvas");
  element.className="diameter_control"
  element.id=id;
  const ctx = element.getContext("2d");
  const max_diameter = 48;
  element.width=192;
  element.height=max_diameter;
  //radius divider removes one radius for the half circle at the end of the control
  const radiusDivider = (element.width/(max_diameter/2))-1; 
  
  let diameter = 15;
  function redraw() {
      let radius = diameter/2;
      let max_radius = max_diameter/2;
      ctx.clearRect(0,0,element.width,element.height);
      ctx.beginPath();
      ctx.arc(element.width-max_radius,max_radius,max_radius,-Math.PI/2,Math.PI/2);
      ctx.lineTo(0,max_radius);
      ctx.fillStyle="#8888";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(radius*radiusDivider,max_radius,radius,0,Math.PI*2);
      ctx.fillStyle="#000";
      ctx.fill();    
      ctx.fillText(diameter,8,10);
  }

  Object.defineProperty(element, 'radius', {
    get() { return this.diameter/2; },
    set(value) {this.diameter=value*2}
  });

  Object.defineProperty(element, 'diameter', {
      get() { return diameter; },
      set(value) {
        value=Math.round(value);
        if (value<1) value=1;
          if (value>max_diameter) value=max_diameter;
          if (value !== diameter) {
              diameter=value;
              element.dispatchEvent(new Event("changed"));
          }
          redraw();
      }
    });

  let dragging = false;
  function handleMouseDown(e) {
      if (e.button !==0 ) return
      let {x,y} = containerToCanvas(element,e.clientX,e.clientY)
      e.stopPropagation();
      element.radius=x/radiusDivider;
      dragging=(y>0)  && (y<element.height);
  }
  function handleMouseMove(e) {
      if (!dragging) return;
      if (e.buttons === 0 )
      {
          dragging=false;
          return
      }    
      
      let {x,y} = containerToCanvas(element,e.clientX,e.clientY)
      
      element.radius=x/radiusDivider;
      
  }
  function handleMouseUp(e) {
      if (e.button !==0 ) return
      dragging=false;
  }
  
  element.addEventListener("mousedown", handleMouseDown,{capture:true});
  element.addEventListener("mousemove", handleMouseMove);
  element.addEventListener("mouseup", handleMouseUp);
  
  
  redraw();
  return element
}


function poulateLayerControl() {
  const layer_control = document.querySelector("#layer_control");
  const content = $(`
    <div class="layer-attributes">
      <div class="imageLayer">      
      <select name="composite-node" class="composite-mode">
        <option value="source-over">Color</option>
        <option value="lighter">Lighter</option>
        <option value="multiply">Multiply</option>
        <option value="screen">Screen</option>
        <option value="overlay">Overlay</option>
        <option value="lighten">Lighten</option>
        <option value="darken">Darken</option>
        <option value="color-dodge">Color Dodge</option>
        <option value="color-burn">Color Burn</option>
        <option value="hard-light">Hard Light</option>
        <option value="soft-light">Soft Light</option>
        <option value="difference">Difference</option>
        <option value="exclusion">Exclusion</option>
        <option value="hue">Hue</option>
        <option value="saturation">Saturation</option>
        <option value="color">Color</option>
        <option value="luminosity">Luminosity</option>        
      </select>
      </div>
      <div class="maskLayer">
        <input type="color" class="maskColor" value="#402040" />
      </div>
      <div>
      <label for="opacity">Opacity</label>
      <input type="range" class="opacity" name="opacity" min="0" max="100" step="1" value="100" />
      </div>
    </div>
    <div class="layer_list">
  
    </div> 
    <div class="layer_actions">
      <div class="add_layer"></div>
      <div class="remove_layer"></div>
    </div>
  `)

  $(layer_control).append(content);

  $("input.maskColor").on("change", e=>{
    lastUsedMaskColor = e.currentTarget.value;
    activePic.activeLayer.maskColor=lastUsedMaskColor;
    activePic.updateVisualRepresentation();
    updateLayerList();
  });

  $("input.opacity").on("input", e=> {
    activePic.activeLayer.opacity = e.currentTarget.value/100; 
    activePic.updateVisualRepresentation(true);
    //shouldn't need this 
    updateLayerList();
  });

  $(".add_layer").on("click",_=>{
    activePic.activeLayer = activePic.addEmptyLayer();
    updateLayerList();
  });

  $(".remove_layer").on("click",_=>{
    activePic.removeLayer(activePic.activeLayer)
    updateLayerList();
  });
}

function updateLayerList() {
  function makeLayerWidget(layer) {    
    const pic=activePic;
    const result = $(`<div class="layer_widget ${layer===pic.activeLayer?'active':''}">
        <div class= "visibilitybox ${layer.visible?'showing':''}"> </div> 
        <canvas class="thumbnail" width="32" height="32"> </canvas>
        <div class="layer_name"> ${layer.title} </div>
        ${layer.mask?`<div class="checkbox ${pic.mask===layer?'checked':''}"></div>`:''}
      </div>
    `)[0];
  
    window.dummyGlobal=result;
    const canvas = result.querySelector(".thumbnail");    
    const ctx=canvas.getContext("2d");
    ctx.drawImage(layer.canvas,0,0,canvas.width,canvas.height);  
    result.layer=layer;

    result.querySelector(".visibilitybox").onmousedown = e => {
      e.stopPropagation();
      layer.visible=!layer.visible;
      pic.updateVisualRepresentation(true);
      updateLayerList();
    }

    if (layer.mask) {
        result.querySelector(".checkbox").onmousedown = e => {
          e.stopPropagation();
          pic.mask= (pic.mask===layer) ? null : layer;
          updateLayerList();
      }
    }
    result.onmousedown = e=> {
      if (e.button==0) {      
        pic.activeLayer=layer;
        updateLayerList()
      }
    }

    return result;
  };
  

  const layer_control=document.querySelector("#layer_control") 
  const layer_list =layer_control.querySelector(".layer_list") 
  while(layer_list.firstChild) layer_list.removeChild(layer_list.firstChild)

  if (!activePic) return;

  const newControls = activePic.layers.map(makeLayerWidget);

  newControls.reverse().forEach(element=>layer_list.appendChild(element))  

  $(".layer-attributes").toggleClass("mask", activePic.activeLayer.mask)

  lastUsedMaskColor=activePic.activeLayer.maskColor;
  $("input.maskColor").val(lastUsedMaskColor)
  $("input.opacity").val((activePic.activeLayer.opacity*100)|0)


}



function updateBrushCursor(picElement) {
  const p=picElement;
  let scale = parseFloat(p.style.getPropertyValue("--scalefactor")); 
  let newCursor = circleImage(tip.size * scale);
  let offset = (newCursor.width/2)|0;
  let value = `url(${newCursor.toDataURL()}) ${offset} ${offset}, auto `;
  if ((newCursor.width < 2) || (newCursor.width>120)) value="crosshair";
  p.style.setProperty("cursor",value);
}


function cloneEvent(event, modifications = {}) {
  let eventProperties = {
    "bubbles": event.bubbles,
    "cancelBubble": event.cancelBubble,
    "cancelable": event.cancelable,
    "composed": event.composed,
    "currentTarget": event.currentTarget,
    "defaultPrevented": event.defaultPrevented,
    "eventPhase": event.eventPhase,
    "isTrusted": event.isTrusted,
    "target": event.target,
    "timeStamp": event.timeStamp,
    "type": event.type,
  };

  // Checking if the event is a MouseEvent, add mouse event properties
  if(event instanceof MouseEvent) {
      eventProperties = {
          ...eventProperties,
          "altKey": event.altKey,
          "button": event.button,
          "buttons": event.buttons,
          "clientX": event.clientX,
          "clientY": event.clientY,
          "ctrlKey": event.ctrlKey,
          "metaKey": event.metaKey,
          "movementX": event.movementX,
          "movementY": event.movementY,
          "offsetX": event.offsetX,
          "offsetY": event.offsetY,
          "pageX": event.pageX,
          "pageY": event.pageY,
          "relatedTarget": event.relatedTarget,
          "screenX": event.screenX,
          "screenY": event.screenY,
          "shiftKey": event.shiftKey,
      };
  }

  return { ...modifications, ...eventProperties  };
}

function forwardEvent(mouseEvent, recipient) {
  var rect = recipient.getBoundingClientRect();

  const options = cloneEvent(mouseEvent,{
    clientX:mouseEvent.clientX - rect.left,
    clientY:mouseEvent.clientY - rect.top,
  });

  var newEvent = new MouseEvent(mouseEvent.type, options )

  recipient.dispatchEvent(newEvent);
}

function createCaptureOverlay(element) {
  var overlay = document.createElement('div');
  overlay.id = 'global_overlay';
  overlay.className = 'fillparent';

  document.body.appendChild(overlay);

  var forwardMouseEvent = function(e) {
      if (e.buttons==0) removeCaptureOverlay();
      forwardEvent(e, element);
  };

  ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick'].forEach(function(eventName) {
      overlay.addEventListener(eventName, forwardMouseEvent);
  });
  overlay.addEventListener("contextmenu",function(e){e.preventDefault(); return false;});
}

function removeCaptureOverlay() {
  $('#global_overlay').remove();
}
