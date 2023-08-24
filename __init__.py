import torch
import base64
import os
import folder_paths
from io import BytesIO
from PIL import Image, ImageOps
from PIL.PngImagePlugin import PngInfo
import numpy as np


cwd_path = os.path.dirname(os.path.realpath(__file__))

local_path = os.path.dirname(__file__) 

relative_target_path = "../../custom_nodes/canvas_tab/web/"

link_path = os.path.normpath(os.path.join(local_path, '..', '..', 'web', 'extensions', 'canvas_tab'))

if not os.path.exists(link_path):
    print(f"{link_path} not present, creating symlink to  {relative_target_path}")
    os.symlink(relative_target_path, link_path)


def image_to_data_url(image):
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue())
    return f"data:image/png;base64,{img_base64.decode()}"

class Canvas_Tab:
    """
    A buffered image

    Class methods
    -------------
    INPUT_TYPES (dict): 
        Tell the main program input parameters of nodes.

    Attributes
    ----------
    RETURN_TYPES (`tuple`): 
        The type of each element in the output tulple.
    RETURN_NAMES (`tuple`):
        Optional: The name of each output in the output tulple.
    FUNCTION (`str`):
        The name of the entry-point method. For example, if `FUNCTION = "execute"` then it will run Example().execute()
    OUTPUT_NODE ([`bool`]):
        If this node is an output node that outputs a result/image from the graph. The SaveImage node is an example.
        The backend iterates on these output nodes and tries to execute all their parents if their parent graph is properly connected.
        Assumed to be False if not present.
    CATEGORY (`str`):
        The category the node should appear in the UI.
    execute(s) -> tuple || None:
        The entry point method. The name of this method must be the same as the value of property `FUNCTION`.
        For example, if `FUNCTION = "execute"` then this method's name must be `execute`, if `FUNCTION = "foo"` then it must be `foo`.
    """
    def __init__(self):
        self.testState = {}
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("CANVAS",),                                
                "canvas": ("CANVAS",),
            }, 
            "hidden": {
               "unique_id":"UNIQUE_ID",
            },
            "optional": {
                "images": ("IMAGE",),
            },

        }

    RETURN_TYPES = ("IMAGE","MASK")
    #RETURN_NAMES = ("image_output_name",)

    FUNCTION = "image_buffer"

    #OUTPUT_NODE = False

    CATEGORY = "MuckingAround"

    def image_buffer(self, unique_id, mask, canvas, images=None):
        print("image_buffer triggered")

        collected_images = list()
        for image in images:
            i = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8)) 
            collected_images.append(image_to_data_url(img))

        print(f'unique_id: {unique_id}')


        image_path = folder_paths.get_annotated_filepath(canvas)
        print("image path")
        print(image_path)
        
        i = Image.open(image_path)
        i = ImageOps.exif_transpose(i)

        
        rgb_image = i.convert("RGB")
        rgb_image = np.array(rgb_image).astype(np.float32) / 255.0
        rgb_image = torch.from_numpy(rgb_image)[None,]


        mask_path = folder_paths.get_annotated_filepath(mask)
        print("mask path")
        print(mask_path)
        
        i = Image.open(mask_path)
        i = ImageOps.exif_transpose(i)

        if 'A' in i.getbands():
            mask_data = np.array(i.getchannel('A')).astype(np.float32) / 255.0
            mask_data = 1. - torch.from_numpy(mask_data)
        else:
            mask_data = torch.zeros((64,64), dtype=torch.float32, device="cpu")


        

        return { "ui": {"collected_images":collected_images},  "result": (rgb_image, mask_data) }

        #return (canvas,)


# A dictionary that contains all nodes you want to export with their names
# NOTE: names should be globally unique
NODE_CLASS_MAPPINGS = {
    "Image_Buffer": Canvas_Tab,
    "Canvas_Tab": Canvas_Tab
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "Canvas_Tab": "Edit In Another Tab"
}
