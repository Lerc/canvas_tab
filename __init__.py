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

class Canvas_Tab:
    """
    A Image Buffer for handling an editor in another tab.
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

    FUNCTION = "image_buffer"

    #OUTPUT_NODE = False

    CATEGORY = "image"

    def image_buffer(self, unique_id, mask, canvas, images=None):

        collected_images = list()
        if images is not None:
            for image in images:
                i = 255. * image.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8)) 
                collected_images.append(image_to_data_url(img))



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
            mask_data = 1. - torch.from_numpy(mask_data)
        else:
            mask_data = torch.zeros((64,64), dtype=torch.float32, device="cpu")


        

        return { "ui": {"collected_images":collected_images},  "result": (rgb_image, mask_data) }


WEB_DIRECTORY = "web"

NODE_CLASS_MAPPINGS = {
    "Canvas_Tab": Canvas_Tab
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Canvas_Tab": "Edit In Another Tab"
}
