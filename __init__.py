"""
@author: Lerc
@title: Canvas Tab
@nickname: Canvas Tab
@description: This extension provides a full page image editor with mask support. There are two nodes, one to receive images from the editor and one to send images to the editor.
"""


import torch
import base64
import os
import folder_paths
from io import BytesIO
from PIL import Image, ImageOps
from PIL.PngImagePlugin import PngInfo
import numpy as np

def image_to_data_url(image):
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue())
    return f"data:image/png;base64,{img_base64.decode()}"

class Send_To_Editor:
    def __init__(self):
        self.updateTick = 1
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
            }, 
            "hidden": {
               "unique_id":"UNIQUE_ID",
            },
            "optional": {
                "images": ("IMAGE",),
            },

        }

    RETURN_TYPES = ()

    FUNCTION = "collect_images"

    OUTPUT_NODE = True

    CATEGORY = "image"
    def IS_CHANGED(self, unique_id, images):
        self.updateTick+=1
        return hex(self.updateTick)

    def collect_images(self, unique_id,  images=None):

        collected_images = list()
        if images is not None:
            for image in images:
                i = 255. * image.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8)) 
                collected_images.append(image_to_data_url(img))


        return { "ui": {"collected_images":collected_images}}


class Canvas_Tab:
    """
    A Image Buffer for handling an editor in another tab.
    """

    def __init__(self):
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
#            "optional": {
#                "images": ("IMAGE",),
#            },

        }

    RETURN_TYPES = ("IMAGE","MASK")

    FUNCTION = "image_buffer"

    #OUTPUT_NODE = False

    CATEGORY = "image"

    def image_buffer(self, unique_id, mask, canvas, images=None):

#        collected_images = list()
#        if images is not None:
#            for image in images:
#                i = 255. * image.cpu().numpy()
#                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8)) 
#                collected_images.append(image_to_data_url(img))
#
#        print(f"Node {unique_id}: images: {images}")    

        image_path = folder_paths.get_annotated_filepath(canvas)
        i = Image.open(image_path)
        i = ImageOps.exif_transpose(i)

        rgb_image = i.convert("RGB")
        rgb_image = np.array(rgb_image).astype(np.float32) / 255.0
        rgb_image = torch.from_numpy(rgb_image)[None,]


        mask_path = folder_paths.get_annotated_filepath(mask)
        i = Image.open(mask_path)
        i = ImageOps.exif_transpose(i)

        if 'A' in i.getbands():
            mask_data = np.array(i.getchannel('A')).astype(np.float32) / 255.0
            mask_data = torch.from_numpy(mask_data)
        else:
            mask_data = torch.zeros((64,64), dtype=torch.float32, device="cpu")


        

        return (rgb_image, mask_data) 


WEB_DIRECTORY = "web"

NODE_CLASS_MAPPINGS = {
    "Canvas_Tab": Canvas_Tab,
    "Send_To_Editor": Send_To_Editor
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Canvas_Tab": "Edit In Another Tab",
    "Send_To_Editor": "Send to Editor Tab"
}
