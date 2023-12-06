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
        case "replace_target":
            if (targetLayer !== null) {
                replaceLayerContent(targetLayer, img);
            }
            break;
      
        case "ignore":
        default: 
    }
  };
  img.src = url;
}

function replaceLayerContent(layer, image) {
    const ctx = layer.canvas.getContext('2d');
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height); 
    ctx.drawImage(image, 0, 0, layer.canvas.width, layer.canvas.height); 
    
    if (activePic===layer.parentPic) {  
        updateLayerList();  
    }
    layer.parentPic.updateVisualRepresentation(false);
}

window.addEventListener('load', () => {
  if (getSignal('clientPage')) {
      console.log("but we're the client page, something is amiss")
  } else {
      setSignal("clientPage");
  }
  console.log("at load time our opener was ", window.opener)
  if (window.opener)  window.opener.postMessage({category:plugin_name,data:"Editor Here"})

});

window.addEventListener("unload", _=> clearSignal("clientPage"));

window.addEventListener('storage', (event) => {  
  if (checkAndClear('findImageEditor')) {
      window.opener.postMessage({category:plugin_name,data:"Editor Here"})

  }
});


window.addEventListener('message', (event) => {
  if (event.data === 'Initiate communication') {
      portToMain = event.ports[0];  // Save the port for future use
      portToMain.postMessage('Hello from Image_editor!');

      portToMain.onmessage = (messageEvent) => {        
        if (messageEvent.data instanceof Object) {            
            const data = messageEvent.data;
            const images=data.images;            
            if (images?.length > 0) {
                loadImagefromURL(images[0]);
            }

            if (data?.retransmit) {
                activePic.updateVisualRepresentation(true);
            }
            
        } else console.log('Message received from main page:', messageEvent.data);
     };
}
});


}; 

