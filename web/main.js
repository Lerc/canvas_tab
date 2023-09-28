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
  },
  getCustomWidgets(app) {
    return {
      CANVAS(node,inputName,inputData,app) {
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
    else if (title==="Send to Editor Tab") {
      initTransmitNode(node) 
    }


  }
});




function initEditorNode(node)
{
  node.collected_images = [];
  node.addWidget("button","Edit","bingo", (widget,graphCanvas, node, {x,y}, event) => focusEditor(node));

  node.widgets.reverse();// because auto created widget get put in first

  node.canvasWidget = node.widgets[1];
  node.maskWidget=node.widgets[2];
  
  node.maskWidget.onTopOf = node.canvasWidget;


  return;
}

function initTransmitNode(node)
{
  node.collected_images = [];

  node.onExecuted = (output)=> {
    if (!editor.window || editor.window.closed) openEditor();

    if (output?.collected_images) {
      if(editor.channel) {
        editor.channel.port1.postMessage( {images:output.collected_images})
      } else {
        //try again after half a second just in case we caught it setting up.
        setTimeout(_=>{editor?.channel.port1.postMessage( {images:output.collected_images})}, 500);
      }

    }      
  }
  
  return;
}

function openEditor() {
  editor = {};//  start over with new editor;
  if (getSignal('clientPage')) {
    //if clientPage is set, there might be a new page to replace the lost one
    setSignal('findImageEditor')
    setTimeout(_=>{
        if (checkAndClear("findImageEditor")) {                    
            //if the flag is still set by here, assume there's no-one out there
            editor.window = window.open('/extensions/canvas_tab/page/index.html', plugin_name);                  
        }    
    } ,1000)
  } else { 
    editor.window = window.open('/extensions/canvas_tab/page/index.html', plugin_name);
  }
}

function focusEditor() {
  if (!editor.window || editor.window.closed) {
    openEditor();
  } else {
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
    background :"#8888",
    _value : "",
    get value() {
      return this._value 
    },
    set value(newValue) {
      this._value=newValue
    },
    draw(ctx, node, width, y) {
      let [nodeWidth,nodeHeight] = node.size;
      if (this.onTopOf) {
        ctx.globalAlpha=0.5;
        y= this.onTopOf.last_y;

      } else {
        ctx.globalAlpha=1;
        ctx.fillStyle = this.background;
        ctx.fillRect(0,y,width,nodeHeight-y);    
      }
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
      let widget = node.widgets[widgetIndex];
      let blob = widget.blob;
      if (!(blob instanceof Blob))  blob = dummyBlob;
      
      let result = await uploadBlob(blob,widget.name+"_Image.png")
      if (result) {
         return result.name;
      }
      return "";
    }
  }
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

function loadBlobIntoWidget(widget, blob) {
  const objectURL = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
        widget.blob = blob;
        widget.image = img;
        app.graph.setDirtyCanvas(true);
        URL.revokeObjectURL(objectURL);
  };
  img.src = objectURL;
}

function messageFromEditor(event) {
  const nodes =  app.graph.findNodesByType("Canvas_Tab");
  //send same thing to all of the Canvas_Tab nodes
  if (event.data.image instanceof Blob) {
    for (const node of nodes) {
      loadBlobIntoWidget(node.canvasWidget,event.data.image);
    }
  }
  if (event.data.mask instanceof Blob) {
    for (const node of nodes) {
      loadBlobIntoWidget(node.maskWidget,event.data.mask);
    }
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
