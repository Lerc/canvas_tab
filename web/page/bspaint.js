"use strict"
var selectedExport;
var maskStaysOnTop = true;

if (location.pathname.includes("/page/")) {
  //don't init if not in the right path
  //this is to stop code running from comfyUI directly
  $(initPaint);
}

var tool=feltTip;

var tip = {
  lastX : 0,
  lastY : 0,
  x : 0.0,
  y : 0.0,
  color : "black",
  size : 5,
  tool : feltTip,
}


var hotkeys = {};

var initialPalette = [
  "#000000","#ffffff",
  "#404040","#808080",
  "#a0a0a0","#b8b8b8",
  "#d0d0d0","#e0e0e0",
  
  "#ff0000","#ff8000",
  "#ffff00","#008000",
  "#00ff00","#00ff80",
  "#0080ff","#50C0ff",
  "#0000ff","#8080ff",
  "#a00060","#ff00ff",
  "#ffa0a0","#a06040",
  "#b07050","#904030"];


var brushSizeControl = brushDiameterControl("tip_diameter");

var picStack = [];

var activePic;
var targetLayer = null; 

function setActivePic(newValue) {
  activePic=newValue;
  updateLayerList()
  if (!activePic) return;
  activePic.bringToFront();

  if (typeof tool.drawUI === "function") tool.drawUI(); 
}

var dragging = false;
var dragButtons = 0;
var dragStartX;
var dragStartY;

var mouseDownX=0;
var mouseDownY=0;


var draggingElement = null;


function setExportPic(pic) {
  setActivePic(pic);
  
  selectedExport=pic;
  
  $(".sidebutton").removeClass("output")
  const button=pic.element.querySelector(".sidebutton");
  button.classList.add("output");

  pic.updateVisualRepresentation(true);
  transmitMask(pic.mask.canvas);
}

function closePic(pic) {
  if (selectedExport===pic) selectedExport=null;
  pic.element.parentElement.removeChild(pic.element);
  if (pic === activePic) {
    const newActive = document.querySelector("#workspace .pic");
    setActivePic(newActive?.pic);
  }
}




var lastUsedMaskColor = "#402040";

class Layer {
  canvas = document.createElement("canvas");
  ctx = this.canvas.getContext("2d",{willReadFrequently:true});
  mask = false;
  visible = true;
  compositeOperation = "source-over";
  opacity = 1;
  _maskColor = lastUsedMaskColor;
  constructor (pic,title, {width,height}, mask = false)  {
    this.parentPic = pic;
    this.canvas.width=width;
    this.canvas.height=height;
    this.mask = mask;
    this.title= title;
    this.transform = [1,0 ,0,1, 0,0];
    this.rotationCenter= {x:width/2,y:height/2};
    
    if (mask) {
      this.compositeOperation="source-over";
    }
  }
  get maskColor() {
    return this._maskColor;
  }
  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
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
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation=this.compositeOperation;
    ctx.globalAlpha=this.opacity;
    ctx.setTransform(...this.transform);
    ctx.drawImage(this.canvas,0,0);
    ctx.restore();    
  }
  convertFromPicCoords(x, y) {
    return reverseTransform({x,y},this.transform)
  }
  // Converts coordinates from this layer's coordinates to the picture's canvas
  convertToPicCoords(x, y) {
    return applyTransform({x,y},this.transform);
  }

  rotate(angle) {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Convert relative coordinates to absolute
    const centerX = this.rotationCenter.x; 
    const centerY = this.rotationCenter.y;

    // Create a translation matrix to move the rotation point to (0,0)
    const translateToOrigin = [1, 0, 0, 1, -centerX, -centerY];

    // Create a rotation matrix
    const rotation = [cos, sin, -sin, cos, 0, 0];

    // Create a translation matrix to move back from (0,0)
    const translateBack = [1, 0, 0, 1, centerX, centerY];

    // Concatenate the transforms: translate back -> rotate -> translate to origin
    let combined = concatenateTransforms(translateBack, rotation);
    combined = concatenateTransforms(combined, translateToOrigin);

    // Apply to the current transform
    this.transform = concatenateTransforms(this.transform, combined);
  }

  translate(dx, dy) {
    const newTransform = [1, 0, 0, 1, dx, dy];
    this.transform = concatenateTransforms(this.transform, newTransform);
  }

  scale(sx, sy = sx) {
    const newTransform = [sx, 0, 0, sy, 0, 0];
    this.transform = concatenateTransforms(this.transform, newTransform);
  }

  undoRecord() {
    return {
      type: 'layer',
      layer: this,
      compositeOperation: this.compositeOperation,
      transform : [...this.transform],
      data: this.ctx.getAllImageData()
    }
  }
  undoTransformRecord() {
    return {
      type:"layerTransform",
      layer:this,
      transform:[...this.transform]
    }
  }

}

function updateMirrorGridButtonImage() {
  const columns = $(".grid_mirrors #repeat_x").val();
  const rows = $(".grid_mirrors #repeat_y").val();
  const image=gridImage(rows,columns,48);
  $("#mirror_grid").css('background-image',`url(${image.toDataURL()})`);
}

function updateMirrorRotationButtonImage() {
  const fins = $(".rotational_mirrors input").val();

  const image=spiralImage(fins,36);
  $("#mirror_rotational").css('background-image',`url(${image.toDataURL()})`);
}

var mirrorFunction = a=>a;

function updateMirrors() {
  let result = a=>a;
  if($("#mirror_rotational.mirror.button").hasClass("down")) {
    const ways = $(".rotational_mirrors input").val();
    const rotationFunction = rotationalSymmetry(ways);
    result = composeFunction(result,rotationFunction);
  } 

  if($("#mirror_grid.mirror.button").hasClass("down")) {
    const columns = $(".grid_mirrors #repeat_x").val();
    const rows = $(".grid_mirrors #repeat_y").val();  
    const gridFunction = cells(columns,rows);
    result = composeFunction(result,gridFunction);
  }
  if($("#mirror_x.mirror.button").hasClass("down"))  result = composeFunction(result,mirrorX);
  if($("#mirror_y.mirror.button").hasClass("down")) result = composeFunction(result,mirrorY);
  if($("#mirror_tlbr.mirror.button").hasClass("down")) result = composeFunction(result,mirrorDiagonalXY);
  if($("#mirror_trbl.mirror.button").hasClass("down")) result = composeFunction(result,mirrorDiagonalY1MinusX);

  mirrorFunction=result;
}

function getDrawAreaAtPoint(uiX, uiY) {
  for (let pic of picStack) {
    const {x,y} = convertCoordsFromUIToPic(uiX, uiY, pic);

    if (x >= 0 && x <= pic.width && y >= 0 && y <= pic.height) {
      return pic;
    }
  }
  return null; // No drawArea found at the point
}

function createDrawArea(canvas = blankCanvas(),initialTitle="Image") {
  const undoDepth = 10;
  const element = document.createElement("div")
  const ctx=canvas.getContext("2d");
  const eventOverlay = document.createElement("div");
  const sidebar = document.createElement("div");
  const closeButton = document.createElement("div");
  const renameButton = document.createElement("div");
  const titleBar = document.createElement("div");
  const title = document.createElement("div");
  var updatingStroke=false;
  sidebar.className = "sidebutton";
  closeButton.className = "closebutton";
  renameButton.className = "renamebutton";
  titleBar.className = "titlebar";
  title.className = "title";
  title.textContent=initialTitle;
  element.className="pic";
  eventOverlay.className="eventoverlay fillparent";

  element.appendChild(sidebar);
  element.appendChild(canvas);
  element.appendChild(eventOverlay);
  element.appendChild(titleBar)
  titleBar.appendChild(closeButton);
  titleBar.appendChild(title);
  titleBar.appendChild(renameButton);

  canvas.ctx=ctx;
  
  const activeOperationCanvas = document.createElement("canvas");
  activeOperationCanvas.width = canvas.width;
  activeOperationCanvas.height = canvas.height;
  activeOperationCanvas.ctx = activeOperationCanvas.getContext("2d",{willReadFrequently:true});
  

  const image = canvas.ctx.getAllImageData();
  const undoStack = [];
  const redoStack = [];
  const layers = [];
  var mask;

  eventOverlay.addEventListener("mousedown", handleMouseDown);
  eventOverlay.addEventListener("mouseup", handleMouseUp);
  eventOverlay.addEventListener("mousemove", handleMouseMove);
  eventOverlay.addEventListener("contextmenu",function(e){e.preventDefault(); return false;});
  
  
  const pic = {element,eventOverlay,image,
    get layers() {return layers},
    get canvas() {return canvas},
    get mask() {return mask},
    set mask(m) {mask=m},
    get width() {return canvas.width},
    get height() {return canvas.height},
    scale:1,
    scalefactor:0,
    offsetX:0,
    offsetY:0,
    isDrawing:false,
    activeLayer:null,
    strokeCoordinates :[], 
    strokeModifier: a=>a,
    setCSSTransform( ) {
      const {element,scale,offsetX,offsetY} = this;
      element.style.setProperty("--scalefactor",scale)
      element.style.setProperty("--translateX",offsetX+"px")
      element.style.setProperty("--translateY",offsetY+"px")
    },
    setPosition(x,y) {
      this.offsetX=x;
      this.offsetY=y;
      this.setCSSTransform();
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
        canvas.ctx.globalCompositeOperation=layer.compositeOperation;
        if (this.isDrawing && layer===this.activeLayer) {
          canvas.ctx.drawImage(activeOperationCanvas,0,0);          
        } else {
          layer.draw(canvas.ctx);
        }
      }
      canvas.ctx.restore();
    },

    commit() {
      let data = activeOperationCanvas.ctx.getAllImageData()
      const undoRecord = {
        type : "layer",
        layer: this.activeLayer,
        transform: [...this.activeLayer.transform],
        data: this.activeLayer.ctx.getAllImageData()
      }
      undoStack.push(undoRecord);
      if (undoStack.length > undoDepth) undoStack.shift();
      redoStack.length=0;

      this.activeLayer.ctx.putImageData(data,0,0);
      this.activeLayer.transform= [1,0 ,0,1, 0,0];
      
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
      this.updateVisualRepresentation(false);

    },
    clearLayer() {
      activeOperationCanvas.ctx.clearRect(0,0,activeOperationCanvas.width,activeOperationCanvas.height);
      this.commit();
    },
    fillLayer(color = "#fff") {
      activeOperationCanvas.ctx.fillStyle=color;
      activeOperationCanvas.ctx.fillRect(0,0,activeOperationCanvas.width,activeOperationCanvas.height);
      this.commit();
    },
    updateVisualRepresentation(transmit=true) {
      if (transmit && this===selectedExport) {
        this.composite(true); //suppress mask for transmitted canvas
        transmitCanvas(canvas);          
      }
      this.composite(false);
      if (typeof tool?.drawUI === "function") tool.drawUI(); 
    },

    startDraw(x,y) {
      if (!this.activeLayer.visible) return; //don't draw on hidden layers.
      this.strokeModifier=mirrorFunction;
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
          const ctx = activeOperationCanvas.ctx;
          ctx.clearRect(0,0,activeOperationCanvas.width,activeOperationCanvas.height);
          ctx.save()
          ctx.setTransform(...this.activeLayer.transform);
          ctx.drawImage(this.activeLayer.canvas,0,0);
          ctx.restore();
          const unitRange=this.strokeCoordinates.map(({x,y})=>({x:x/canvas.width,y:y/canvas.height}));

          const strokes = this.strokeModifier([unitRange])          
          for (const unitStroke of strokes) {
            const stroke=unitStroke.map(({x,y})=>({x:x*canvas.width,y:y*canvas.height}));
            tip.tool.drawOperation(activeOperationCanvas.ctx,tip,stroke)
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
    updateLayerList(newList) {
      if (maskStaysOnTop && this.mask) {
        const maskIndex = newList.indexOf(this.mask);
        if (maskIndex !== newList.length - 1) {
          newList.splice(maskIndex, 1);
          newList.push(this.mask);
        }
      }
      const undoRecord = {
        type: 'layerList',
        previousList: [...layers]
      };
      undoStack.push(undoRecord);
      if (undoStack.length > undoDepth) undoStack.shift();
      layers.length = 0;  // Clear the existing array
      layers.push(...newList);  // Fill with new values
    },

    addEmptyLayer(above = this.activeLayer) {
      const newLayer = new Layer(this,"new layer", canvas);
      this.insertLayerAbove(newLayer, above);
      this.activeLayer = newLayer;
      return newLayer;
    },
    addDuplicateLayer(layer,above=layer) {
      if (!layer) {
          return this.addEmptyLayer();
      } else {
          if (layers.indexOf(above) < 0) above=this.activeLayer;
          // Duplicate the provided layer
          const newLayer = new Layer(this, layer.title, {width: layer.canvas.width, height: layer.canvas.height}, layer.mask);
          newLayer.ctx.drawImage(layer.canvas, 0, 0); // Copy the content of the original layer
          newLayer.transform=[...layer.transform];
          newLayer.visible = layer.visible;
          newLayer.compositeOperation = layer.compositeOperation;
          newLayer.opacity = layer.opacity;
          this.insertLayerAbove(newLayer, above);
          this.activeLayer = newLayer;
          return newLayer;
      }    
    },
    removeLayer(layer = this.activeLayer) {
      const newList = layers.filter(l => l !== layer);
      this.updateLayerList(newList);
    },
    insertLayerBelow(layer, below = null) {
      const newList = [...layers];
      const indexExisting = newList.indexOf(layer);
      if (indexExisting !== -1) {
        newList.splice(indexExisting, 1);
      }
      const indexBelow = newList.indexOf(below);
      if (indexBelow !== -1) {
        newList.splice(indexBelow, 0, layer);
      } else {
        newList.push(layer);
      }
      this.updateLayerList(newList);
    },
    insertLayerAbove(layer, above = null) {
      const newList = [...this.layers];
      const indexExisting = newList.indexOf(layer);
      if (indexExisting !== -1) {
        newList.splice(indexExisting, 1);
      }
      const indexAbove = newList.indexOf(above);
      if (indexAbove !== -1) {
        newList.splice(indexAbove + 1, 0, layer);
      } else {
        newList.unshift(layer); // Inserts at the top if 'above' layer is not found
      }
      this.updateLayerList(newList);
    },    
    addUndoRecord(record) {
      undoStack.push(record);
      if (undoStack.length > undoDepth) undoStack.shift();
      redoStack.length=0;
    },
    undo() {
      const lastRecord = undoStack.pop();
      if (lastRecord) {
        if (lastRecord.type === 'layerList') {
          redoStack.push({type: 'layerList', previousList: [...layers]});
          layers.length = 0;
          layers.push(...lastRecord.previousList);
        } else if (lastRecord.type === 'layer') {
          redoStack.push({
            type: 'layer',
            layer: lastRecord.layer,
            compositeOperation: lastRecord.layer.compositeOperation,
            transform : [...lastRecord.layer.transform],
            data: lastRecord.layer.ctx.getAllImageData()
          });
          lastRecord.layer.transform=[...lastRecord.transform];
          lastRecord.layer.compositeOperation=lastRecord.compositeOperation;
          const ctx = lastRecord.layer.ctx;
          ctx.putImageData(lastRecord.data, 0, 0);
        } else if (lastRecord.type==="layerTransform") {
          redoStack.push(lastRecord.layer.undoTransformRecord());
          lastRecord.layer.transform=[...lastRecord.transform];
        }
        //... (handle other types of undoRecords)
      }
      this.updateVisualRepresentation(true);
      updateLayerList();
    },
    
    redo() {
      const lastRecord = redoStack.pop();
      if (lastRecord) {
        if (lastRecord.type === 'layerList') {
          undoStack.push({type: 'layerList', previousList: [...layers]});
          layers.length = 0;
          layers.push(...lastRecord.previousList);
        } else if (lastRecord.type === 'layer') {
          undoStack.push({
            type: 'layer',
            layer: lastRecord.layer,
            compositeOperation: lastRecord.layer.compositeOperation,
            transform: [...lastRecord.layer.transform],            
            data: lastRecord.layer.ctx.getAllImageData()
          });
          lastRecord.layer.transform=[...lastRecord.transform];
          lastRecord.layer.compositeOperation=lastRecord.compositeOperation;
          lastRecord.layer.ctx.putImageData(lastRecord.data, 0, 0);
        } else if (lastRecord.type==="layerTransform") {
          redoStack.push(lastRecord.layer.undoTransformRecord());
          lastRecords.layer.transform=[...lastRecord.transform];
        }
        //... (handle other types of redoRecords)
      }
      this.updateVisualRepresentation(true);
      updateLayerList();
    },    
  }

  layers.push( new Layer(pic,"base", canvas));
  
  mask = new Layer(pic,"mask", canvas,true);
  mask.opacity = 0.6;
  layers.push(mask);
  pic.activeLayer= layers[0];
  
  layers[0].ctx.putImageData(image,0,0);
  activeOperationCanvas.ctx.putImageData(image,0,0);

  
  eventOverlay.pic = pic;
  sidebar.addEventListener("mousedown",_=>  setExportPic(pic))
  closeButton.addEventListener("mousedown",_=>  closePic(pic))
  titleBar.addEventListener("mousedown",handleTitleBarMouseDown,false);
  renameButton.addEventListener("mousedown",_=>{
  
    const originalValue = title.textContent; 
    const input = $(`<input type="text" class="title-edit">`)[0];
    titleBar.classList.add("renaming");
    input.value=originalValue;
    title.textContent="";
    title.appendChild(input);
    input.focus();
    input.addEventListener("keydown", e=>{
      if (e.key === 'Enter') {
        title.textContent=(input.value !== "")?input.value:originalValue;
        titleBar.classList.remove("renaming");
        e.preventDefault(); 
      } else if (e.key === 'Escape') {
        title.textContent = originalValue;
        titleBar.classList.remove("renaming");
      }
    },true);
    input.addEventListener("blur",_=>{
      title.textContent=(input.value !== "")?input.value:originalValue;
      titleBar.classList.remove("renaming");
      
    })
  });

  pic.setCSSTransform();
  setActivePic(pic)
  return pic;
  
  function handleTitleBarMouseDown(e) {
    if (e.target.nodeName === "INPUT") return;

    setActivePic(pic);
    if (e.button === 1 || e.button === 0) {
      dragStartX = pic.offsetX;
      dragStartY = pic.offsetY;
      mouseDownX = e.clientX;
      mouseDownY = e.clientY;
      element.style.transition = 'none'; 
      dragging = true;
      dragButtons=e.buttons;
      createCaptureOverlay(eventOverlay);
      e.preventDefault(); // Prevent text selection during drag
    }
  }
}



function initPaint(){ 

  // Call this function at initialization
  window.uiCanvas = initUICanvas();

  $("#background").val("#ffffff").data("eraser",true);
  var palette=$("#palette");
  for (let i of initialPalette) {
    const e=`<div class="paletteentry" style="background-color:${i}"> </div>`;
    palette.append($(e).data("colour",i));
  }
  palette.append($(`<div class="paletteentry erase">Erase</div>`).data("colour","#0000"))
  poulateLayerControl();
  $(".background")[0].addEventListener("wheel",handleMouseWheel);

  $(".paletteentry").on("mousedown", function(e) {
    if (![feltTip,pixelTip].includes(tool)) {
      setTool(feltTip);
    }
    let eraser=false;
    let c= $(e.currentTarget).data("colour");
    if (c==="#0000") {
      c="#ffffff";
      eraser = true;
    } 
    if (e.which == 1) {
      if (e.ctrlKey && !eraser) {
        c=$("#foreground").val();
        $(e.currentTarget).data("colour",c).css("background-color",c)
      } else {
        $("#foreground").val(c).data("eraser",eraser);
      }
    }
    if (e.which == 2 && !eraser) {
      c=$("#foreground").val();
      $(e.currentTarget).data("colour",c).css("background-color",c)
    }    
    if (e.which == 3 ) {
      if (e.ctrlKey && !eraser) {
        c=$("#background").val();
        $(e.currentTarget).data("colour",c).css("background-color",c)
      } else {
        $("#background").val(c).data("eraser",eraser);
      }
    }
  }).on("contextmenu",
  function(){return false;}
  );

  $("#pen")[0].tool=feltTip;
  $("#pixels")[0].tool=pixelTip;
  $("#eraser")[0].tool=eraserTip;
  $("#fine_eraser")[0].tool=pixelClear;
  $("#eyedropper")[0].tool=eyeDropper;
  $("#transform")[0].tool=transformTool;

  $(".tool.button").on("click",function(e) {setTool(e.currentTarget.tool);});

  $("#clear").on("click",function(e) {activePic?.clearLayer()});
  $("#undo").on("click",function(e) {activePic?.undo()});
  $("#redo").on("click",function(e) {activePic?.redo()});

  brushSizeControl.addEventListener("changed", e=> {
    tip.size=brushSizeControl.diameter;

    for (let p of $(".pic")) {
      updateBrushCursor(p);
    }

  });

  addEventListener("keydown", handleKeyDown);

  $(".panel").append(brushSizeControl).append(`
  <div class="subpanel simple_mirrors">
    <div id="mirror_x" class="mirror button"></div>
    <div id="mirror_y" class="mirror button"></div>
    <div id="mirror_tlbr" class="mirror button"></div>
    <div id="mirror_trbl" class="mirror button"></div>
  </div>  
    <div class="subpanel grid_mirrors">
      <span style="display:inline-block;">
        <input id="repeat_x" type="number" min="1" max="10" value="3" step="1" required />
        <input id="repeat_y" type="number" min="1" max="10" value="3" step="1" required />
      </span>
      <div id="mirror_grid" class="mirror button"></div>
    </div>
    <div class="subpanel rotational_mirrors">
      <div id="mirror_rotational" class="mirror button"></div>
      <input id="repeat_x" type="number" min="2" max="180" value="2" step="1" required />
    </div>
  `);

  $('.grid_mirrors input').on("change",_=>{updateMirrorGridButtonImage(); updateMirrors()})
  $('.rotational_mirrors input').on("change",_=>{updateMirrorRotationButtonImage(); updateMirrors()})
  
  $('.mirror.button').on("mousedown", e=>{
    e.currentTarget.classList.toggle('down');
    updateMirrors();
  })
  updateMirrorGridButtonImage();
  updateMirrorRotationButtonImage();

  $("#newImageBtn").on("click", function() {
    console.log("click #newImageBtn")
    $("#newImageModal").addClass("modal-active");
  });
  
  $(".close-button").on("click", function() {
    $(".modal-active").removeClass("modal-active");
  });
  
  $(".cancel-button").on("click", function() {
    $(".modal-active").removeClass("modal-active");
  });

  $(".create-button").on("click", function() {
    const width = $("#imageWidth").val();
    const height = $("#imageHeight").val();
    $(".modal-active").removeClass("modal-active");
    let area=createDrawArea(blankCanvas(width, height))
    $("#workspace").append(area.element);
  });
  
  $(window).on("click", function(event) {
    if ($(event.target).hasClass("modal")) {
      $(".modal-active").removeClass("modal-active");
    }
  });
  
  $("#newImageForm").on("submit", function(event) {
    event.preventDefault();
  });
  
  $(window).on("keydown", function(event) {
    if (event.key === "Escape" && $(".modal-active").length) {
      $(".modal-active").removeClass("modal-active");
    }
  });
  


  window.test1=createDrawArea(undefined,"Image A");
  window.test2=createDrawArea(undefined,"Image B");
  test1.setPosition(30,60) ;
  test2.setPosition(640,60) ;
  test1.activeLayer=test1.addEmptyLayer();  
  targetLayer=test2.addEmptyLayer();  

  //setActivePic(test1);

  $("#workspace").append(test1.element);
  $("#workspace").append(test2.element);
    

  brushSizeControl.diameter=tip.size;

  setExportPic(test1);
  setTool(feltTip)
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
    const layer = new Layer(pic,"generation",pic.canvas);
    layer.ctx.drawImage(image,0,0);    
    console.log("new layer", layer)
    console.log(layer.canvas.width, layer.canvas.height)
    pic.insertLayerBelow(layer)
    pic.activeLayer=layer;
    updateLayerList();
    pic.updateVisualRepresentation(true);
  } 
  else {
    addNewImage(image);
  }
}

function handleKeyDown(e) {
  if (document.activeElement.tagName === 'INPUT') {
    return;  //suppress hotkeys when an input element has focus.
  }
  if (!e.key) return;
  if (e.key === "Dead" ) return;
  if (e.key === "Unidentified" ) return;
  

  //checking for hotkeys
  let keyID = "";
  if (e.ctrlKey) keyID+="CTRL_"
  if (e.altKey) keyID+="ALT_"
  if (e.shiftKey) keyID+="SHIFT_"
  let key = e.key.toUpperCase();
  if (key === " ") key = 'SPACE';

  const hotkeyCode= keyID+key;
  //console.log({hotkeyCode})
  if (hotkeys.hasOwnProperty(hotkeyCode)) {
    hotkeys[hotkeyCode](); 
  }
}


function handleMouseDown(e) {
  let pic = e.currentTarget.pic;
  setActivePic(pic);
  
  const maskLayer = activePic.activeLayer.mask

  
  switch (e.button) {
    case 0:      
      tip.tool = $("#foreground").data("eraser")?eraserTip:tool;      
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
      dragButtons = e.buttons;
      createCaptureOverlay(e.currentTarget)

      break;
    case 2:
      tip.colour = $("#background").val();
      tip.tool = (maskLayer || $("#background").data("eraser"))?eraserTip:tool;
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

    if (e.buttons!==dragButtons) {
      stopDragging();
      return;
    }
    var dx = e.clientX-mouseDownX;
    var dy = e.clientY-mouseDownY;
    console.log({dx,dy})
    pic.offsetX=dragStartX+dx;
    pic.offsetY=dragStartY+dy;
    pic.setCSSTransform();
  }

}

function handleMouseUp(e) {
  let pic = e.currentTarget.pic;
  activePic = pic;

  if (dragging) {
    if (e.buttons!==dragButtons) {
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
    if (e.buttons!==dragButtons) {
      stopDragging();
      removeCaptureOverlay();
      return;
    }
    var dx = e.clientX-mouseDownX;
    var dy = e.clientY-mouseDownY;
    pic.offsetX=dragStartX+dx;
    pic.offsetY=dragStartY+dy;
    pic.setCSSTransform();
  }
  
  if (pic.isDrawing && e.buttons === 0) {
    removeCaptureOverlay();
    pic.stopDraw(e.offsetX,e.offsetY)
  }
  if (pic.isDrawing) pic.draw(e.offsetX,e.offsetY);
}


  
  
function handleMouseWheel(e) {
  let direction = -Math.sign(e.deltaY);
  const scaleAround= {x:e.pageX,y:e.pageY};

  setScale(activePic.scalefactor+direction,scaleAround);
  activePic.setCSSTransform();
}
  
function scalefactorToSize(n) {
  return (Math.pow(2,(n/2)));
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
    pic.setCSSTransform();
    updateBrushCursor(pic.element);
}

function setTool(newValue) {
  if (newValue !== tool)
  {
    tool=newValue;
    const ctx=uiCanvas.getContext("2d");
    ctx.clearRect(0,0,1e5,1e5);
    if (typeof tool?.init === "function") tool.init(); 
  }

  
  for (const pic of picStack) {
    updateBrushCursor(pic.element)
  }

  $(".tool.button").removeClass("down");

  for (let e of $(".tool.button")) {
    e.classList.toggle("down",(e.tool === tool))
  };
  brushSizeControl.diameter=tip.size;
  uiCanvas.style.pointerEvents=tool?.eventHandlers?"":"none";
  
}


  
function stopDragging() {
  dragging=false;
  $(activePic.element).css("transition" , "");
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
        <option value="source-over">Standard Color</option>
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
    <div class="layer_list layer_dropzone">
  
    </div> 
    <div class="layer_actions">
    <div class="add_layer" title="New empty layer"></div>
    <div class="duplicate_layer" title="duplicate current layer.  Ctrl duplicate target layer"></div>
    <div class="remove_layer" title="delete selected layer"></div>
    </div>
  `)

  $(layer_control).append(content);

  $('select.composite-mode').on("change", e=>{
    const mode = e.currentTarget.value;
    activePic.activeLayer.compositeOperation=mode; 
    activePic.updateVisualRepresentation(true);
  }) 
  $("input.maskColor").on("change", e=>{
    lastUsedMaskColor = e.currentTarget.value;
    activePic.activeLayer.maskColor=lastUsedMaskColor;
    activePic.updateVisualRepresentation(false);
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

  $(".duplicate_layer").on("click",e=>{
    const layer = e.ctrlKey?targetLayer:activePic.activeLayer;
    activePic.activeLayer = activePic.addDuplicateLayer(layer);
    activePic.updateVisualRepresentation();
    updateLayerList();
  });

  $(".remove_layer").on("click",_=>{
    activePic?.removeLayer(activePic.activeLayer)
    activePic?.updateVisualRepresentation(true)
    updateLayerList();
  });

  let dropzone =$(".layer_list.layer_dropzone");
  dropzone.on("dragover",e=>{
    dropzone.children().removeClass("insert_after");
    dropzone.removeClass("insert_top")
    const insertPoint=findInsertPoint(dropzone[0],e);
    if (insertPoint !== draggingElement) {
      if (insertPoint) {
        insertPoint.classList.add("insert_after");
      } else {
        dropzone.addClass("insert_top")
      }
      e.preventDefault();
    }
  });
  dropzone.on("dragleave", e=>{
    dropzone.removeClass("insert_top")
    dropzone.children().removeClass("insert_after");
  });
  dropzone.on("drop", e=>{
    dropzone.removeClass("insert_top")
    const insertPoint=findInsertPoint(dropzone[0],e);
    if (insertPoint !== draggingElement) {
        if (draggingElement) {
          const layer = draggingElement.layer;
          const below = insertPoint?.layer;
          activePic.insertLayerBelow(layer,below);
          updateLayerList();
          activePic.updateVisualRepresentation(true);
        } else {
          //handle file drop maybe?
        }

    }
  })
}

function findInsertPoint(dropzone, event) {
  const dropzoneRect = dropzone.getBoundingClientRect();
  const children = Array.from(dropzone.children);

  // Normalize the event clientY coordinate to the dropzone's coordinate space
  const eventClientY = event.clientY - dropzoneRect.top;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childRect = child.getBoundingClientRect();
    const childTop = childRect.top - dropzoneRect.top;
    const childBottom = childTop + childRect.height;

    if (eventClientY >= childTop && eventClientY <= childBottom) {
      if (child === draggingElement) {
        return draggingElement; 
      }
      if (eventClientY < childTop + childRect.height / 2) {
        // Event is in the top half of the child element
        return i === 0 ? null : children[i - 1];
      } else {
        // Event is in the bottom half of the child element
        return child;
      }
    }
  }
  
  return children.length > 0 ? children[children.length - 1] : null;  
}

function updateLayerTitle(newTitle, layer) {
  layer.title = newTitle;
  updateLayerList();
  activePic.updateVisualRepresentation(true);
}

function updateLayerList() {
  function makeLayerWidget(layer) {    
    const pic=activePic;
    const result = $(`<div class="layer_widget ${layer===pic.activeLayer?'active':''} ${targetLayer==layer?'target':''}" draggable="true">
        <div class= "visibilitybox ${layer.visible?'showing':''}"> </div> 
        <canvas class="thumbnail" width="32" height="32"> </canvas>
        <div class="layer_name"> ${layer.title} </div>
        ${layer.mask?`<div class="checkbox ${pic.mask===layer?'checked':''}"></div>`:''}
      </div>
    `)[0];
  
    window.dummyGlobal=result;
    const canvas = result.querySelector(".thumbnail");    
    const ctx=canvas.getContext("2d");
    ctx.save()
    ctx.setTransform(...layer.transform);
    ctx.drawImage(layer.canvas,0,0,canvas.width,canvas.height);  
    ctx.restore();
    result.layer=layer;

    //  Renaming handler
    const layerNameDiv = result.querySelector('.layer_name');
    layerNameDiv.ondblclick = function() {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = layer.title;
        input.className = 'layer_name_input';
        input.onblur = () => {layerNameDiv.removeChild(input);}
        input.onkeydown = function(e) {
          if (e.key === 'Backspace') {
              e.stopPropagation(); 
          }
          if (e.key === 'Enter') {
              updateLayerTitle(input.value, layer);
              e.preventDefault(); 
          } else if (e.key === 'Escape') {
              layerNameDiv.textContent = layer.title;
          }
      };
        layerNameDiv.textContent = '';
        layerNameDiv.appendChild(input);
        input.focus();
    };

    

    result.querySelector(".visibilitybox").onmousedown = e => {
      e.stopPropagation();
      layer.visible=!layer.visible;
      pic.updateVisualRepresentation(true);
      updateLayerList();
    }
    result.addEventListener("contextmenu", e=>e.preventDefault()) 

    result.addEventListener('mousedown', (e) => {
      // Check for non-mask layer, middle mouse button click or left click with Ctrl key
      if (!layer.mask && (e.button === 2) ) {
        targetLayer = (targetLayer === layer) ? null : layer;
        e.preventDefault(); 
        updateLayerList();
      }
    });

    if (layer.mask) {
        result.querySelector(".checkbox").onmousedown = e => {
          e.stopPropagation();
          pic.mask= (pic.mask===layer) ? null : layer;
          updateLayerList();
      }
    }
    result.onmousedown = e=> {
      if (e.ctrlKey && e.button==0 && pic.activeLayer?.visible) {
        pic.removeLayer(layer);
        pic.updateVisualRepresentation(true)
        updateLayerList();
      } else 
      if (e.button==0) {      
        if (pic.activeLayer !== layer) {
          pic.activeLayer=layer;
          updateLayerList()
        }
      }
    }
    result.ondrag = e=>{
      draggingElement=e.currentTarget;
    }
    result.ondragend = e=> {
      if (draggingElement === e.currentTarget ) draggingElement=null;
    }

    return result;
  };
  

  const layer_control=document.querySelector("#layer_control") 
  const layer_list =layer_control.querySelector(".layer_list") 
  while(layer_list.firstChild) layer_list.removeChild(layer_list.lastChild)

  if (!activePic) return;

  const newControls = activePic.layers.map(makeLayerWidget);

  newControls.reverse().forEach(element=>layer_list.appendChild(element))  

  $(".layer-attributes").toggleClass("mask", activePic.activeLayer.mask)

  lastUsedMaskColor=activePic.activeLayer.maskColor;
  $("input.maskColor").val(lastUsedMaskColor)
  $("input.opacity").val((activePic.activeLayer.opacity*100)|0)
  $('select.composite-mode').val(activePic.activeLayer.compositeOperation);


}



function updateBrushCursor(picElement) {
  const p=picElement;
  if (!p) return;
  let scale = parseFloat(p.style.getPropertyValue("--scalefactor")); 
  let value ="crosshair";
  if (tool.cursorFunction) value = tool.cursorFunction(scale);
  p.style.setProperty("cursor",value);
  //set matching cursor for user interface overlay;
  uiCanvas.style.setProperty("cursor",value);
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


function changeFrameOfReference(fromElement, x,y, toElement) {
  const fromBounds=fromElement.getBoundingClientRect();
  const toBounds = toElement.getBoundingClientRect();
  x = x + fromBounds.x - toBounds.x;
  y = y + fromBounds.y - toBounds.y;
  return {x,y}
}

function fillOrClear(from) {
  if (from.data("eraser")){
    activePic?.clearLayer()
  } else {
    activePic?.fillLayer(from.val());
  }   
}




hotkeys["CTRL_Z"] = _=>{activePic?.undo()}
hotkeys["CTRL_SHIFT_Z"] = _=>{activePic?.redo()}
hotkeys["BACKSPACE"] = _=>{activePic?.clearLayer()}

hotkeys["ALT_BACKSPACE"] = _=>{fillOrClear($("#foreground"))}
hotkeys["CTRL_BACKSPACE"] = _=>{fillOrClear($("#background"))}
  
hotkeys["P"] = _=>{setTool(eyeDropper);}
hotkeys["B"] = _=>{setTool(feltTip);}
hotkeys["Z"] = _=>{setTool(pixelTip);}
hotkeys["E"] = _=>{setTool(eraserTip);}
hotkeys["T"] = _=>{setTool(transformTool);}

hotkeys["]"] = _=>{brushSizeControl.diameter+=1}
hotkeys["["] = _=>{brushSizeControl.diameter-=1;}


hotkeys["Q"] = _=>{
  
  drawPicFramesOnUICanvas(uiCanvas, picStack);  
}
