

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


