// these are support functions for bspaint,
// Nothing in here should rely on global state 

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
