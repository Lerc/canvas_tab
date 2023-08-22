import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js"
import { ComfyWidgets } from "/scripts/widgets.js";

let myticker =0; 
let dummyBlob;
let editor= {};  // one image editor for all nodes, otherwise communication is messy when reload happens
                  // for now that means only one editor node is practical.
                  // adding a protocol that identifies multiple nodes would allow the one editor
                  // to serve multiple nodes.

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



app.registerExtension({
	  name: "canvas_tab",
  init() {
    console.log("init:"+this.name)
    installStorageListener();
    checkForExistingEditor();
    const blankImage=document.createElement("canvas");
    blankImage.width=64;
    blankImage.height=64;
    blankImage.toBlob(a=>dummyBlob=a)

  },

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name==="Canvas_Tab") {
      console.log("registering node definition",{nodeData,nodeType});
    }
  },
  getCustomWidgets(app) {
    console.log("asked for custom widgets for canvas");
    return {
      CANVAS(node,inputName,inputData,app) {
        console.log("making CANVAS widget");
        return addCanvasWidget(node,inputName,inputData, app)
      } 
    }
  },

  nodeCreated(node) {
    const title = node.getTitle();
    // node.type not set at this point? 
    if (title==="Edit In Another Tab") {
      initEditorNode(node) 
    }
  }
});



function initEditorNode(node)
{
  node.collected_images = [];
  node.addWidget("button","Edit","bingo", (widget,graphCanvas, node, {x,y}, event) => openOrFocusEditor(node));

  node.widgets.reverse();// because CANVAS is auto created first

  node.onExecuted = (output)=> {
    if (output?.collected_images && editor.channel) {
      editor.channel.port1.postMessage( {images:output.collected_images})
    }
      
  }
  return;
}

function openOrFocusEditor() {
  if (!editor.window || editor.window.closed) {
      if (getSignal('clientPage')) {
          //if clientPage is set, there might be a new page to replace the lost one
          setSignal('findImageEditor')
          setTimeout(_=>{
              console.log("one second after click")
              if (checkAndClear("findImageEditor")) {                    
                  //if the flag is still set by here, assume there's no-one out there
                  editor.window = window.open('/extensions/canvas_tab/page/index.html', plugin_name);                  
              }    
          } ,1000)
      } else { 
          editor.window = window.open('/extensions/canvas_tab/page/index.html', plugin_name);
      }
  } else {
      editor.window.focus();
  }
}

function launchEditorWindow(node)  {  
  if (!(node.editor.window)) {
     editor.window = window.open('/extensions/canvas_tab/page/index.html');
     editor.window.addEventListener('load', () => {
        const channel = new MessageChannel();
        editor.channel=channel;        
        editor.window.postMessage('Initiate communication', '*', [channel.port2]);

        channel.port1.onmessage = (event) => {
          if (event.data instanceof Blob) {
              node.imageBlob = event.data;
              const objectURL = URL.createObjectURL(node.imageBlob);
              const img = new Image();
      
              img.onload = () => {
                node.canvasWidget.image = img;
                app.graph.setDirtyCanvas(true);
      
                URL.revokeObjectURL(objectURL);
              };
      
              img.src = objectURL;
          } else {
              console.log('Message received from Image Editor:', event.data);
          }
        };
      });
  } else {
    //window was set, we should do some checks to see if it still exists.

    editor.window.focus();
  }   
  
}



async function uploadBlob(blob,filename="blob") {
  try {
    // Wrap file in formdata so it includes filename
    const body = new FormData();
    body.append("image", blob,filename);
    const resp = await api.fetchApi("/upload/image", {
      method: "POST",
      body,
    });

    if (resp.status === 200) {      
      return await resp.json();;
    } else {
      alert(resp.status + " - " + resp.statusText);
    }
  } catch (error) {
    alert(error);
  }
}

function addCanvasWidget(node,name,inputData,app) {

  const widget = {
    type: inputData[0],
    name,
    size: [128,128],
    image: null,
    _value : "",
    get value() {
      return this._value 
    },
    set value(newValue) {
      this._value=newValue
    },
    draw(ctx, node, width, y) {
      const [nodeWidth,nodeHeight] = node.size;
       ctx.fillStyle = "#8888";
       ctx.fillRect(0,y,width,nodeHeight-y);   
       if (this.image) {
        const imageAspect = this.image.width/this.image.height;
        let height = nodeHeight-y;
        const widgetAspect = width / height;
        let targetWidth,targetHeight;
        if (imageAspect>widgetAspect) {
          targetWidth=width;
          targetHeight=width/imageAspect;
        } else {
          targetHeight=height;
          targetWidth=height*imageAspect;
        }
        ctx.drawImage(this.image, (width-targetWidth)/2,y+(height-targetHeight)/2,targetWidth,targetHeight);
       }
    },
    computeSize(...args) {          
      return [128,128];
    },
    async serializeValue(nodeId,widgetIndex) {
      let blob = node.imageBlob;
      if (!(blob instanceof Blob))  blob = dummyBlob;
      
      let result = await uploadBlob(blob,"canvasImage.png")
      console.log(result);

      if (result) {
         return result.name;
      }
      return "";
    }
  }
  node.canvasWidget = widget;  
  node.addCustomWidget(widget);

  return widget;
}

function initiateCommunication() {
  if (editor.window && !editor.window.closed) {
    editor.channel= new MessageChannel();
    editor.window.postMessage('Initiate communication', '*', [editor.channel.port2]);
    editor.channel.port1.onmessage = messageFromEditor;
  }
}

function messageFromEditor(event) {
  console.log("message from port")
  if (event.data instanceof Blob) {
    console.log("received a blob");
    const nodes =  app.graph.findNodesByType("Canvas_Tab");
    //send same thing to all of the Canvas_Tab nodes

    const imageBlob =  event.data;
    const objectURL = URL.createObjectURL(imageBlob);
    const img = new Image();
    img.onload = () => {
      for (const node of nodes) {
          node.imageBlob = imageBlob
          node.canvasWidget.image = img;
      }
      app.graph.setDirtyCanvas(true);
      URL.revokeObjectURL(objectURL);
    };
    img.src = objectURL;
  } else {
    console.log('Message received from Image Editor:', event.data);
  }
}

function checkForExistingEditor() {
  if (checkAndClear('clientAttached')) {
      setSignal("findImageEditor")
      // Signal the Image Editor page to identify itself for reattachment
  }
}

function installStorageListener() {
  window.addEventListener('storage', (event) => {
    if (event.key.startsWith(plugin_name)) {
        const key = event.key.slice(plugin_name.length+1);
        if (key === 'reconnect' && event.newValue === 'true') {
            clearSignal('reconnect');
            initiateCommunication();
        }
    
        if (key === 'foundImageEditor' && event.newValue === 'true') {
            editor.window = window.open('', plugin_name);
            initiateCommunication();
            clearSignal('foundImageEditor');
        }    
    }
  });
}
