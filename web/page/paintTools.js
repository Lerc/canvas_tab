'use strict';

function convertCoordsFromPicToUI(x,y, pic) {
  const picRect = pic.element.getBoundingClientRect();
  const workspaceRect = document.getElementById('workspace').getBoundingClientRect();

  // Scale the point
  const scaledX = x * pic.scale;
  const scaledY = y * pic.scale;

  // Translate the point based on the pic's position in the workspace
  const uiX = picRect.left - workspaceRect.left + scaledX;
  const uiY = picRect.top - workspaceRect.top + scaledY;

  return { x: uiX, y: uiY };
}

function convertCoordsFromUIToPic(x,y, pic) {
  const picRect = pic.element.getBoundingClientRect();
  const workspaceRect = document.getElementById('workspace').getBoundingClientRect();

  // Translate the point to the pic's coordinate system
  const picX = x - (picRect.left - workspaceRect.left);
  const picY = y - (picRect.top - workspaceRect.top);

  // Scale the point based on the pic's scale
  const scaledX = picX / pic.scale;
  const scaledY = picY / pic.scale;

  return { x: scaledX, y: scaledY };
}


function initUICanvas() {
  const uiCanvas = document.createElement('canvas');
  uiCanvas.id = 'uiCanvas';
  uiCanvas.style.position = 'absolute';
  uiCanvas.style.left = '0';
  uiCanvas.style.top = '0';
  uiCanvas.style.zIndex = '101'; // Ensure it's above other elements

  const workspace = document.getElementById('workspace');
  workspace.appendChild(uiCanvas);

  const resizeCanvas = () => {
    uiCanvas.width = workspace.clientWidth;
    uiCanvas.height = workspace.clientHeight;
  };

  // Initial resize
  resizeCanvas();

  // Resize canvas when window resizes
  window.addEventListener('resize', resizeCanvas);

  uiCanvas.addEventListener('mousedown', (event) => handleMouseEvent(event, 'mousedown'));
  uiCanvas.addEventListener('mouseup', (event) => handleMouseEvent(event, 'mouseup'));
  uiCanvas.addEventListener('mousemove', (event) => handleMouseEvent(event, 'mousemove'));
  uiCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

function handleMouseEvent(event, eventType) {
    if (tool.eventHandlers) {      
      if ((event.buttons&4)==4) {
        passEventToElementBelow(event);
      }else  {
        if (tool.eventHandlers[eventType]) {
          // Call the tool's event handler
          tool.eventHandlers[eventType](event);
        }
      }

    } else {
        // Pass the event to the element below
        passEventToElementBelow(event);
    }
    event.preventDefault();

}

function passEventToElementBelow(event) {
    uiCanvas.style.pointerEvents = 'none';

    // Find the element below the cursor
    let elemBelow = document.elementFromPoint(event.clientX, event.clientY);

    uiCanvas.style.pointerEvents = '';

    // Dispatch the event to the element below
    if (elemBelow) {
        forwardEvent(event,elemBelow);
    }
}

  return uiCanvas;
}

function drawPicFramesOnUICanvas(uiCanvas, picList) {
  const ctx = uiCanvas.getContext('2d');
  ctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height); // Clear the canvas

  picList.forEach(pic => {
    // Convert pic's corners to UI Canvas coordinates
    const topLeft = convertCoordsFromPicToUI(0, 0, pic);
    const topRight = convertCoordsFromPicToUI(pic.width, 0, pic);
    const bottomLeft = convertCoordsFromPicToUI(0, pic.height, pic);
    const bottomRight = convertCoordsFromPicToUI(pic.width, pic.height, pic);

    // Draw rectangle
    ctx.beginPath();
    ctx.moveTo(topLeft.x,topLeft.y);
    ctx.lineTo(topRight.x,topRight.y);
    ctx.lineTo(bottomRight.x,bottomRight.y);
    ctx.lineTo(bottomLeft.x,bottomLeft.y);
    ctx.lineTo(topLeft.x,topLeft.y);
    ctx.strokeStyle = 'red';
    ctx.stroke();

    // Draw cross lines
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.moveTo(topRight.x, topRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.stroke();
  });
}



const pixelTip = {
  drawOperation (ctx,toolInfo,strokePath) {
    ctx.fillStyle=toolInfo.colour;
    for (let {x,y} of strokePath) {
      x=Math.floor(x-0.25);
      y=Math.floor(y-0.25);
      ctx.fillRect(x,y,1,1);
    };
  }
}

const eyeDropper={
  drawOperation(ctx,toolInfo,strokePath) {
    const last = strokePath.at(-1);
    let {x,y} = last;
    x=Math.floor(x-0.25);
    y=Math.floor(y-0.25);
    let canvas = ctx.canvas;
    if (x>=0 && y>=0 && x<canvas.width && y<canvas.height) {
      const sample = activePic.canvas.ctx.getImageData(x,y,1,1).data;
      const toHex = (byte) => byte.toString(16).padStart(2, '0');
      const color= "#" + toHex(sample[0]) + toHex(sample[1]) + toHex(sample[2]);
      $("#foreground").val(color)
    }
  },
  eventHandlers: {
    mousedown(e) { 
      const {offsetX,offsetY} = e;
      const pic = getDrawAreaAtPoint(offsetX,offsetY);

      if (!pic) return;
      const {x,y} = convertCoordsFromUIToPic(offsetX,offsetY,pic);
      if (x>=0 && y>=0 && x<pic.width && y<pic.height) {
        const sample = pic.canvas.ctx.getImageData(x,y,1,1).data;
        const toHex = (byte) => byte.toString(16).padStart(2, '0');
        const color= "#" + toHex(sample[0]) + toHex(sample[1]) + toHex(sample[2]);
        $("#foreground").val(color)
      }
      console.log({x,y})
    }
  }
}

const feltTip={
  drawOperation(ctx,toolInfo,strokePath) {
    ctx.lineWidth=toolInfo.size;
    ctx.strokeStyle=toolInfo.colour;
    ctx.lineCap="round";
    ctx.lineJoin="round";
    ctx.beginPath();
    for (let {x,y} of strokePath) {
      ctx.lineTo(x,y);
    }
    ctx.stroke();
  },
  cursorFunction : circleBrush
} 


const eraserTip={
  drawOperation (ctx,toolInfo,strokePath) {  
    ctx.save();
    ctx.lineWidth=toolInfo.size;
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
  },
  cursorFunction :circleBrush
}


const pixelClear = {
  drawOperation(ctx,toolInfo,strokePath) {
    let x=Math.floor(toolInfo.x-0.25);
    let y=Math.floor(toolInfo.y-0.25);
    ctx.clearRect(x,y,1,1);
    for (let {x,y} of strokePath) {
      x=Math.floor(x-0.25);
      y=Math.floor(y-0.25);
      ctx.clearRect(x,y,1,1);
    };
  }
}


const transformTool = (_=> {  //closure
  let rotateMode = false;
  let doubleClickGap=300;
  let mouseDownTime =0;
  let mouseDownTransform = [1,0,  0,1, 0,0];
  let mouseDownAngle = 0;
  let layer;
  let dragHandler;
  let mouseDownPosition
  let preserveAspect = false;
  let moved = false;
  let scaleHandlers= [
    dragTopLeft,dragTopRight,dragBottomRight,dragBottomLeft,dragTop,dragRight,dragBottom,dragLeft
  ];


  const tool = {
    init() {
      rotateMode=false;
      this.drawUI();
    },
    drawOperation() {
      console.log("transform tool should not draw, this is a bug")
    },
    drawUI() {
      //drawPicFramesOnUICanvas(uiCanvas,[activePic]);
      const ctx=uiCanvas.getContext("2d");
      ctx.clearRect(0,0,1e5,1e5);
      let handles=controlPoints(0,0,activePic.activeLayer.width,activePic.activeLayer.height);
      ctx.fillStyle="black";
      ctx.strokeStyle="white";


      if (rotateMode) {
        let {x,y} = activePic.activeLayer.rotationCenter;
        const picPoints = activePic.activeLayer.convertToPicCoords(x,y)
        const uiPos = convertCoordsFromPicToUI(picPoints.x,picPoints.y,activePic);       
        ctx.strokeStyle="black";
        ctx.strokeRect(uiPos.x-5,uiPos.y-5,10,10);
        ctx.strokeStyle="white";
        ctx.strokeRect(uiPos.x-4,uiPos.y-4,8,8);
        for (let{x,y} of handles) {
          const picPoints = activePic.activeLayer.convertToPicCoords(x,y)
          const uiPos = convertCoordsFromPicToUI(picPoints.x,picPoints.y,activePic);
          ctx.beginPath();
          ctx.arc(uiPos.x,uiPos.y,8,0,Math.PI*2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(uiPos.x,uiPos.y,7,0,Math.PI*2);
          ctx.stroke();
        }  
      } else {
        for (let{x,y} of handles) {
          const picPoints = activePic.activeLayer.convertToPicCoords(x,y)
          const uiPos = convertCoordsFromPicToUI(picPoints.x,picPoints.y,activePic);
          ctx.fillRect(uiPos.x-5,uiPos.y-5,10,10);
          ctx.strokeRect(uiPos.x-4,uiPos.y-4,8,8);
        }  
      }
    
    }  
  }

  tool.eventHandlers ={
    mousedown(e) { 
      if (e.button == 0) {
        let now = Date.now();
        let clickSpacing = now-mouseDownTime;
        mouseDownTime=now;
        if (clickSpacing < doubleClickGap) {
          doubleClickHandler(e);
          return;
        }

        const mousePos = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
        layer = activePic?.activeLayer;
        if (!layer) return;
        let handles=controlPoints(0,0,layer.width,layer.height);
        dragHandler=null;
        for (let i=0;i<handles.length;i++) {
          const {x,y} = handles[i];
          const picPoints = layer.convertToPicCoords(x,y)
          //const uiPos = convertCoordsFromPicToUI(picPoints.x,picPoints.y,activePic);
          //if (max( abs(uiPos.x-e.offsetX), abs(uiPos.y-e.offsetY) ) <8 ) {
            if (max( abs(picPoints.x-mousePos.x), abs(picPoints.y-mousePos.y) ) <8 ) {
            dragHandler=rotateMode?rotateHandler:scaleHandlers[i];
            break;
          }
        }
        if (!dragHandler) {
          if (  mousePos.x >0  && 
                mousePos.x<=layer.width &&
                mousePos.y >0  && 
                mousePos.y<=layer.height
            ) {
              dragHandler=translateHandler;
            }
            if (rotateMode) {
              let {x,y} = layer.convertToPicCoords(layer.rotationCenter.x,layer.rotationCenter.y);
              console.log({x,y,mousePos})
              if (max( abs(x-mousePos.x), abs(y-mousePos.y) ) <8 ) {
                dragHandler=translateCenterHandler;
              }
            }
          }
        if (dragHandler) {
          let center = layer.convertToPicCoords(layer.rotationCenter.x,layer.rotationCenter.y)
          mouseDownAngle= v2Angle(v2Sub(mousePos,center));
          mouseDownTransform=[...layer.transform];
          mouseDownPosition = {x:e.offsetX,y:e.offsetY}          
          console.log({mouseDownAngle})
          moved=false;

        }
      }
    },
    mouseup(e) { 

    },
    mousemove(e) { 
      
      if ((e.buttons && 1) !== 1) dragStop();
      if (dragHandler) {
        if (!moved) {
          activePic.addUndoRecord(layer.undoTransformRecord());
          moved=true;
        }
        dragHandler(e);

      }
      tool.drawUI();

    },
  }

  function controlPoints (left, top, right, bottom) {
    const midX = (left+right)/2;
    const midY = (top+bottom)/2;
    return [
      {x:left, y:top},
      {x:right, y:top},
      {x:right, y:bottom},
      {x:left, y:bottom},
      {x:midX, y:top},
      {x:right, y:midY},
      {x:midX, y:bottom},
      {x:left, y:midY}
    ]
  }
  
  function dragStop() {
    dragHandler=null;
  }

  function doubleClickHandler(e) {
    rotateMode=!rotateMode;
    tool.drawUI();
  }

  function scaleHandler(handle,anchor,position,lockX=false,lockY=false) {
    const newTransform=scaleTransformByHandle(handle,anchor,position,mouseDownTransform,lockX,lockY);

    layer.transform = newTransform;

    activePic.updateVisualRepresentation();

  }

  function translateHandler(e) {
    let dx = e.offsetX -mouseDownPosition.x
    let dy = e.offsetY -mouseDownPosition.y; 

    let newTransform = [...mouseDownTransform];
    newTransform[4]+=dx;
    newTransform[5]+=dy;

    layer.transform=newTransform;
    activePic.updateVisualRepresentation();
  }

  function translateCenterHandler(e) {
    const mousePos = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    layer.rotationCenter= layer.convertFromPicCoords(mousePos.x,mousePos.y);
    activePic.updateVisualRepresentation();

  }

  function dragTopLeft(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:0,y:0},{x:layer.width,y:layer.height},mouseCurrentPosition);
  }

  
  function dragTopRight(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:layer.width,y:0},{x:0,y:layer.height},mouseCurrentPosition);

  }
  function dragBottomRight(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:layer.width,y:layer.height},{x:0,y:0},mouseCurrentPosition);
  }
  function dragBottomLeft(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:0,y:layer.height},{x:layer.width,y:0},mouseCurrentPosition);
  }
  function dragTop(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:layer.width/2,y:0},{x:layer.width,y:layer.height},mouseCurrentPosition,true);
  }
  function dragRight(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:layer.width,y:layer.height/2},{x:0,y:0},mouseCurrentPosition,false,true);
  }
  function dragLeft(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:0,y:layer.height/2},{x:layer.width,y:0},mouseCurrentPosition,false,true);

  }
  function dragBottom(e) {
    const mouseCurrentPosition = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);
    scaleHandler({x:layer.width/2,y:layer.height},{x:layer.width,y:0},mouseCurrentPosition,true);
  }
  
  function rotateHandler(e) {
    let center = layer.convertToPicCoords(layer.rotationCenter.x,layer.rotationCenter.y)
    let mousePos = convertCoordsFromUIToPic(e.offsetX,e.offsetY,activePic);

    let angle= v2Angle(v2Sub(mousePos,center));
    let angleDelta = angle-mouseDownAngle;
    layer.transform=[...mouseDownTransform];
    layer.rotate(angleDelta*RadiansToDegrees);
    activePic.updateVisualRepresentation();
  }



  return tool;
})();  //end closure for transformTool
