console.log("canvas_tab/web/page/main.js  - executing");

const plugin_name = "canvas_link";

function setSignal(key) {
    const keyName = plugin_name+":"+key;
    localStorage.setItem(keyName, 'true');
}

function clearSignal(key) {
    const keyName = plugin_name+":"+key;
    localStorage.removeItem(keyName);
}

function getSignal(key) {
    const keyName = plugin_name+":"+key;
    return localStorage.getItem(keyName) === 'true';
}

function checkAndClear(key) {
    const keyName = plugin_name+":"+key;
    let result=localStorage.getItem(keyName) === 'true';
    if (result) localStorage.removeItem(keyName);
    return result; 
}



if (location.pathname.includes("/page/")) {
  console.log("client-page-only code running");


  
//const canvas = document.querySelector("#drawing>canvas")
//const ctx = canvas.getContext('2d');

let isDrawing = false;
let drawColor = 'orange';  // default to black
let portToMain; // variable to hold the MessageChannel port

function transmitCanvas(canvas) {
    if (portToMain) {
        canvas.toBlob( blob=>{
          portToMain.postMessage( {"image": blob} );      
        });
      }
  }

function transmitMask(canvas) {
    if (portToMain) {
        canvas.toBlob( blob=>{
          portToMain.postMessage( {"mask": blob} );      
        });
      }
  }

  
/*
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        drawColor = 'black';  // left button
    } else if (e.button === 2) {
        drawColor = 'white';  // right button
    }

    isDrawing = true;
    drawCircle(e);
});

canvas.addEventListener('mouseup', () => {
    isDrawing = false;
    ctx.beginPath(); // Clear the current path
    transmitCanvas();
});

canvas.addEventListener('mousemove', drawCircle);



function drawCircle(e) {
    if (!isDrawing) return;

    ctx.lineWidth = 6 * 2; // Circle's radius * 2
    ctx.lineCap = 'round';
    ctx.strokeStyle = drawColor;

    ctx.lineTo(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);
    ctx.stroke();

    ctx.beginPath(); // Begin a new path
    ctx.moveTo(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);
}

// Prevent context menu from showing on right-click
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
*/

function loadImagefromURL(url) {
  var img = new Image();
  img.onload = function() {    
    console.log("import mode is",$("#import_mode").val())
    switch ($("#import_mode").val()) {
        case "layer":
            addNewLayer(img)
        break;
        case "image":
        setExportPic(addNewImage(img));    

        break;
        case "ignore":
        default: 
    }
  };
  img.src = url;
}

window.addEventListener('load', () => {
  if (getSignal('clientPage')) {
      console.log("but we're the client page, something is amiss")
  } else {
      setSignal("clientPage");
  }
  clearSignal("reconnect");// zap any existing signal to trigger change event on other side
  setSignal("reconnect");// Signal the main page to reconnect
});

window.addEventListener("unload", _=> clearSignal("clientPage"));

window.addEventListener('storage', (event) => {  
  if (checkAndClear('findImageEditor')) {
      // Signal the main page that the Image editor page is here
      setSignal("foundImageEditor")
  }
});


window.addEventListener('message', (event) => {
  if (event.data === 'Initiate communication') {
      setSignal("clientAttached");
      portToMain = event.ports[0];  // Save the port for future use
      portToMain.postMessage('Hello from Image_editor!');
      //transmitCanvas();

      portToMain.onmessage = (messageEvent) => {
        console.log(messageEvent)
        if (messageEvent.data instanceof Object) {
          loadImagefromURL(messageEvent.data.images[0]);
        } else console.log('Message received from main page:', messageEvent.data);
     };
}
});

/*
window.addEventListener('message', (event) => {
    if (event.data === 'Initiate communication') {
        portToMain = event.ports[0];  // Save the port for future use
        portToMain.postMessage('Hello from sibling!');

        portToMain.onmessage = (messageEvent) => {
           if (messageEvent.data instanceof Object) {
            loadImageToCanvas(messageEvent.data.images[0]);
           } else console.log('Message received from main page:', messageEvent.data);
        };
    }
});
*/

}; 

