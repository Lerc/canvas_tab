"use strict"
var selectedExport;

if (location.pathname.includes("/page/")) {
  //don't init if not in the right path
  //this is to stop code running from comfyUI directly
  $(initPaint);
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
    size : 5,
    colour : "green"
  }

var pen=feltTip;

var brushSizeControl = brushDiameterControl("tip_diameter");

var picStack = [];

var activePic;

var dragging = false;


var dragStartX;
var dragStartY;


function setExportPic(pic) {
  selectedExport=pic;

  $(".sidebutton").removeClass("output")
  const button=pic.element.querySelector(".sidebutton");
  button.classList.add("output");

  pic.commit();
}



class Layer {
  canvas = document.createElement("canvas");
  ctx = this.canvas.getContext("2d",{willReadFrequently:true});
  mask = false;
  visible = true;
  constructor (baseCanvas, mask = false)  {
    this.canvas.width=baseCanvas.width;
    this.canvas.height=baseCanvas.height;
    this.mask = mask;
  }
}

function blankCanvas(width=512, height=width) {
  const canvas = document.createElement("canvas");
  canvas.width=width;
  canvas.height=height;
  return canvas;
}

function createDrawArea(canvas = blankCanvas()) {
  const undoDepth = 10;
  const element = document.createElement("div")
  const ctx=canvas.getContext("2d");
  const eventOverlay = document.createElement("div");
  const sidebar = document.createElement("div");
  sidebar.className = "sidebutton";
  element.className="pic";
  eventOverlay.className="eventoverlay fillparent";

  element.appendChild(sidebar);
  element.appendChild(canvas);
  element.appendChild(eventOverlay);
  canvas.ctx=ctx;
  
  const activeOperationCanvas = document.createElement("canvas");
  activeOperationCanvas.width = canvas.width;
  activeOperationCanvas.height = canvas.height;
  activeOperationCanvas.ctx = activeOperationCanvas.getContext("2d",{willReadFrequently:true});
  

  const image = canvas.ctx.getImageData(0,0,canvas.width,canvas.height)
  const undo = [];
  const redo = [];
  const layers = [];

  layers.push( new Layer(canvas));
  layers.push( new Layer(canvas,true));
  
  layers[0].ctx.putImageData(image,0,0);
  activeOperationCanvas.ctx.putImageData(image,0,0);

  eventOverlay.addEventListener("mousedown", handleMouseDown);
  eventOverlay.addEventListener("mouseup", handleMouseUp);
  eventOverlay.addEventListener("mousemove", handleMouseMove);
  eventOverlay.addEventListener("contextmenu",function(e){e.preventDefault(); return false;});
 
  
  const result = {element,eventOverlay,image,layers,canvas,
    scale:1,
    scalefactor:0,
    offsetX:0,
    offsetY:0,
    isDrawing:false,
    activeLayer:layers[0],

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
      let z = 1;
      for (const {element} of picStack) {
        element.style.zIndex=z;
        element.setAttribute("data-z",z);
        z-=1;
      }
    },

    composite() {
      canvas.ctx.clearRect(0,0,canvas.width,canvas.height)
      for (const layer of this.layers) {
        if (layer===this.activeLayer) {
          canvas.ctx.drawImage(activeOperationCanvas,0,0);          
        } else {
          canvas.ctx.drawImage(layer.canvas,0,0);

        }
      }
    },

    commit() {
      let data = activeOperationCanvas.ctx.getImageData(0,0,canvas.width,canvas.height);
      const undoRecord = {
        layer: this.activeLayer,
        data: this.activeLayer.ctx.getImageData(0,0,canvas.width,canvas.height)
      }
      undo.push(undoRecord);
      if (undo.length > undoDepth) undo.shift();
      redo.length=0;

      this.activeLayer.ctx.putImageData(data,0,0);
      this.isDrawing = false;
      this.composite();
      if (selectedExport===this) {
        transmitCanvas(canvas);
      }
    },

    startDraw(x,y) {
      let data = this.activeLayer.ctx.getImageData(0,0,canvas.width,canvas.height);
      activeOperationCanvas.ctx.putImageData(data,0,0);
      this.isDrawing=true;
      tip.x=x;
      tip.y=y;
      this.draw(x,y);
    },

    stopDraw(x,y) {
      this.isDrawing=false;
      this.commit();
    },

    draw(x,y) {
      tip.lastX=tip.x;
      tip.lastY=tip.y;
      tip.x=x;
      tip.y=y;
      if (pen) pen(activeOperationCanvas.ctx,tip);
      this.composite();
    }
  
  }
  eventOverlay.pic = result;
  sidebar.addEventListener("mousedown",_=>  setExportPic(result))

  activePic=result;
  result.setTransform();
  result.bringToFront();
  return result;
}



function initPaint(){ 
  var palette=$("#palette");
  for (let i of initialPalette) {
    const e=`<div class="paletteentry" style="background-color:${i}"> </div>`;
    palette.append($(e).data("colour",i));
  }
  $(".background")[0].addEventListener("wheel",handleMouseWheel);

  $(".paletteentry").on("mousedown", function(e) {
    let c= $(e.currentTarget).data("colour");
    console.log("color ",c,e.which);
    if (e.which == 1) $("#foreground").val(c);
    if (e.which == 3) $("#background").val(c);

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
    console.log("radius_changed");
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

function handleMouseDown(e) {
  console.log("mousedown on pic",e);
  let pic = e.currentTarget.pic;
  pic.bringToFront();
  switch (e.button) {
    case 0:
      tip.colour = $("#foreground").val();
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
      console.log({dragging})
      createCaptureOverlay(e.currentTarget)

      break;
    case 2:
      tip.colour = $("#background").val();
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
  activePic = pic;
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
}
  
function pixelTip(ctx,penInfo) {
  console.log(penInfo)
  let x=Math.floor(penInfo.x-0.25);
  let y=Math.floor(penInfo.y-0.25);
  ctx.fillStyle=penInfo.colour;
  ctx.fillRect(x,y,1,1);
}

function feltTip(ctx,penInfo) {
  ctx.lineWidth=penInfo.size;
  ctx.strokeStyle=penInfo.colour;
  ctx.lineCap="round";
  let lastX=Math.round(penInfo.lastX);
  let lastY=Math.round(penInfo.lastY);
  let x=Math.round(penInfo.x);
  let y=Math.round(penInfo.y);
  
  ctx.beginPath();
  ctx.moveTo(lastX,lastY);
  ctx.lineTo(x,y);
  ctx.stroke();
}
  
function eraserTip(ctx,penInfo) {  
  ctx.save();
  ctx.lineWidth=penInfo.size;
  ctx.strokeStyle="white";
  ctx.lineCap="round";
  ctx.globalCompositeOperation="destination-out";
  let lastX=Math.round(penInfo.lastX);
  let lastY=Math.round(penInfo.lastY);
  let x=Math.round(penInfo.x);
  let y=Math.round(penInfo.y);
  
  ctx.beginPath();
  ctx.moveTo(lastX,lastY);
  ctx.lineTo(x,y);
  ctx.stroke();
  ctx.restore();
}

function pixelClear(ctx,penInfo) {
  console.log(penInfo)
  let x=Math.floor(penInfo.x-0.25);
  let y=Math.floor(penInfo.y-0.25);
  ctx.clearRect(x,y,1,1);
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
      ctx.fillText(diameter,3,10);
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
