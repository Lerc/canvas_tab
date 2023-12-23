// these are support functions for bspaint,
// Nothing in here should rely on global state 
'use strict';

const abs=Math.abs;
const min=Math.min;
const max=Math.max;
const median = (a, b, c) => max(min(a, b), min(max(a, b), c));

const RadiansToDegrees = 180/Math.PI;

function v2Distance(a,b) {
  return Math.hypot(a.x-b.x,a.y-b.y);
}

function v2Length({x,y}) {
  return Math.hypot(x,y)
}

function v2Sub(a,b) {
  return {x:a.x-b.x,y:a.y-b.y};
}
function v2Add(a,b) {
  return {x:a.x+b.x,y:a.y+b.y};
}

function v2Scale(a,scale) {
  return {x:a.x*scale,y:a.y*scale}
}

function v2Normalise(a,length=1) {
  const scale = length/v2Length(a);
  return v2Scale(a,scale);
}

function v2Dot(a,b) {
  return (a.x*b.x + a.y*b.y);
}

function v2PurpCW({x, y}) {
  return {x: y, y: -x};
}

function v2PurpCCW({x, y}) {
  return {x: -y, y: x};
}
function v2Angle({x,y}) {
  return Math.atan2(y,x);
}

var v2Purp=v2PurpCCW;


function applyTransform({x,y},transform) {
  const [a, b, c, d, e, f] = transform;

    // Apply the layer's transformation matrix
    const newX = a * x + c * y + e;
    const newY = b * x + d * y + f;

    return { x: newX, y: newY };
}

function reverseTransform({x,y},transform) {
  const [a, b, c, d, e, f] = transform;

  // Apply the inverse of the layer's transformation matrix
  const det = a * d - b * c;

  if (det === 0) {
    console.error("Transformation matrix is not invertible");
    return {x,y}
  }

  const newX = (d * (x - e) - c * (y - f)) / det;
  const newY = (-b * (x - e) + a * (y - f)) / det;

  return { x: newX, y: newY };
}

function concatenateTransforms([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
  return [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1
  ];
}

function scaleTranformWithSkewFudge(A, B, newTransformedA, originalTransform, skewCompensation=0, lockX=false,lockY=false) {

    const transformedA = applyTransform(A, originalTransform);
    const transformedB = applyTransform(B, originalTransform);
    // Calculate relative differences
    const originalRelDiff = {
        x: transformedB.x - transformedA.x,
        y: transformedB.y - transformedA.y
    };
    const newRelDiff = {
        x: transformedB.x - newTransformedA.x,
        y: transformedB.y - newTransformedA.y
    };
    
    const angle = Math.atan2(originalTransform[1], originalTransform[0]);
    // Calculate inverse rotation matrix
    const cosTheta = Math.cos(-angle);
    const sinTheta = Math.sin(-angle);
    const inverseRotation = [cosTheta, sinTheta, -sinTheta, cosTheta, 0, 0];
    
    // Apply inverse rotation to the relative differences
    const rotatedOriginalRelDiff = applyTransform(originalRelDiff, inverseRotation);
    const rotatedNewRelDiff = applyTransform(newRelDiff, inverseRotation);
    
    // Calculate scale factors
    let scale = {
      x: rotatedNewRelDiff.x / rotatedOriginalRelDiff.x, 
      y: rotatedNewRelDiff.y / rotatedOriginalRelDiff.y
    }
    
    const divergence =v2Dot( v2Normalise(v2Sub(transformedB,transformedA)), v2Purp(v2Normalise(v2Sub(transformedA,newTransformedA))));
    const lengthAMovement = v2Distance(transformedA,newTransformedA);
    
  
    const scaleTransform= [scale.x + skewCompensation* divergence*lengthAMovement, 0, 0, scale.y, 0, 0];
  
    if (lockX) scaleTransform[0]=1;
    if (lockY) scaleTransform[3]=1;
    
    const newTransform = concatenateTransforms(originalTransform,scaleTransform);
    const newTransformedB = applyTransform(B,newTransform);
    
    // Calculate translation to keep B in place
    const translateX = transformedB.x - newTransformedB.x;
    const translateY = transformedB.y - newTransformedB.y;
    
    const translation = [1, 0, 0, 1, translateX, translateY];
    
    const translated = concatenateTransforms(translation,originalTransform);
    const result = concatenateTransforms(translated,scaleTransform);
    return result;    
}

function scaleTransformWithDynamicFix(a,b,desiredA,transform,lockX = false,lockY=false) {
  function errorVector(skewCandidate) {
    const newTransform = scaleTranformWithSkewFudge(a, b, desiredA, transform,skewCandidate,false,false);
    const actualA = applyTransform(a,newTransform);
    return v2Sub(actualA,desiredA);
  }
  const candidate1 = 0;
  const candidate2 = 110;
  var skewAdjustment=0;

  let errorVector1 = errorVector(candidate1);
  if (errorVector1.x===0 && errorVector1.y===0) {
    //All good to go
    skewAdjustment=0;
  } else {
    let errorVector2 = errorVector(candidate2);

    // Calculate the slopes for x and y components of the error vector
    let slopeX = (errorVector2.x - errorVector1.x) / (candidate2 - candidate1);
    let slopeY = (errorVector2.y - errorVector1.y) / (candidate2 - candidate1);
  
    // Calculate where the line crosses zero for both components
    let zeroCrossingX = candidate1 - errorVector1.x / slopeX;
    let zeroCrossingY = candidate1 - errorVector1.y / slopeY;
  
    if (slopeY==0) {
      skewAdjustment=slopeX;
    }
    else if (slopeX == 0) {
      skewAdjustment=slopeY;
    } else {
      //not strictly necessary to average here but we're in full-on dodgy math country now.
      skewAdjustment = (zeroCrossingX + zeroCrossingY) / 2;      
    }
  }
  
  return scaleTranformWithSkewFudge(a,b,desiredA,transform,skewAdjustment,lockX,lockY)
}


function scaleTransformByHandle(a, stationaryPoint, desiredTransformedA, originalTransform, lockX = false, lockY=false) {
  return scaleTransformWithDynamicFix(a,stationaryPoint,desiredTransformedA,originalTransform,lockX,lockY)
}


function cells(x=1,y=1) {
  let width = 1/x;
  let height = 1/y;
  return strokes => {
    let result = [];
    //this is ia bit inefficient, but handles the case where strokes go from one cell to another.
    //could be optimized to measure the first point of a stroke set and to do operations relative to 
    //the cell that the first point occurs in.
    for (let tx = -x; tx<x+x; tx++) {
      for (let ty=-y; ty<y+y; ty++) {
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

function mirrorDiagonalXY(strokes) {
  return [...strokes, ...strokes.map( a => a.map(({x, y}) => ({x: y, y: x})))];
}

function mirrorDiagonalY1MinusX(strokes) {
  return [...strokes, ...strokes.map( a => a.map(({x, y}) => ({x: 1 - y, y: 1 - x})))];
}

function rotationalSymmetry(ways) {
  const angleIncrement = (Math.PI * 2) / ways;
  const originX = 0.5, originY = 0.5;
  
  return function(strokes) {
    let newStrokes = [...strokes];
    
    for(let i = 1; i < ways; i++) {
      const angle = i * angleIncrement;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      
      const rotatedStrokes = strokes.map( a => a.map(({x, y}) => ({
        x: cosAngle * (x - originX) - sinAngle * (y - originY) + originX,
        y: sinAngle * (x - originX) + cosAngle * (y - originY) + originY
      })));
      
      newStrokes = [...newStrokes, ...rotatedStrokes];
    }
    
    return newStrokes;
  };
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

function gridImage(rows,columns,size=24) {
  const result = blankCanvas(size,size,false);
  const ctx = result.ctx;
  const rowHeight = size/rows;
  const columnWidth = size/columns;
  for (let tx=0; tx<columns; tx++) {
    for (let ty=0; ty<rows; ty++) {
      ctx.strokeRect(tx*columnWidth,ty*rowHeight, columnWidth, rowHeight);
    }
  }
  return result;
}

function spiralImage(fins,size=24) {
  const result = blankCanvas(size,size,false);
  const ctx = result.ctx;
  let angularSpacing = Math.PI*2/fins;
  let cx=size/2;
  let cy=size/2;
  for (let i = 0; i<fins;i++)   {
    const a = i*angularSpacing+.5;
    
    const x= Math.sin(a)*size;
    const y= Math.cos(a)*size;
    const x2= Math.sin(a-angularSpacing*.5)*size*.5;
    const y2= Math.cos(a-angularSpacing*.5)*size*.5;
    ctx.beginPath()
    ctx.moveTo(cx+x,cy+y);
    ctx.quadraticCurveTo(cx+x2,cy+y2,cx,cy)
    ctx.lineTo(cx,cy)
    ctx.stroke();
  } 
  return result;
}

function containerToCanvas(canvas,clientX,clientY) {
  let canvasSpace= canvas.getBoundingClientRect();
  let scaleX=canvas.width/canvasSpace.width;
  let scaleY=canvas.height/canvasSpace.height;
  let x= (clientX-canvasSpace.x) * scaleX;
  let y= (clientY-canvasSpace.y) * scaleY;
  return {x,y};
}  

function insideBounds(point,bounds) {
  if (!point) return false;
  return (point.x>bounds.x && point.y>bounds.y && point.x<bounds.right && point.y<bounds.bottom)
}

function canvasPngAsBytes (canvas,callback) {
  function handleBlob(blob) {
    var reader = new FileReader();
    reader.onload = function () {	callback(this.result);	};
    reader.readAsArrayBuffer(blob);
  }
  canvas.toBlob(handleBlob);
}


function circleBrush(scale) {
  let newCursor = circleImage(tip.size * scale);
  let offset = (newCursor.width/2)|0;
  let value = `url(${newCursor.toDataURL()}) ${offset} ${offset}, auto `;
  if ((newCursor.width < 2) || (newCursor.width>120)) value="crosshair";
  return value;
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
