# Workflows


## Simple sdxl turbo workflow

![turbo workflow](https://raw.githubusercontent.com/Lerc/canvas_tab/main/workflows/Turbo_canvas.svg)

This is the basic turbo workflow.  The default view in the canvas is initialized to provide two
images,  Image A is sent to the canvas node.  A layer on Image B is set as the target for new
generations.

You can draw and refine your work by starting with a simple scribble in Image A and when something
you like is generated, CTRL-LeftClick on the duplicate layer button will copy that image
and you can use that as a base drawing.

![target info](https://raw.githubusercontent.com/Lerc/canvas_tab/main/workflows/TomatoDoodle.jpg)

You can get into a good design process by drawing a general outline with a high denoising value, then
successively copying the generated image and drawing on top of it for finer adjustments, gradually reducing
the denoising value as you go.

Sometimes when iterating generating images bases upon previous generations the image may start to become blurry,
this workflow contains a node for sharpening the image that can reduce this problem,  By default the sharpening node
is set to bypass meaning it takes no time and has no effect.   If the image becomes blurry you can reactivate this
node for a single generation to get a sharper output to use as a new source image.

## Multi Canvas with ControlNet

![turbo workflow](https://raw.githubusercontent.com/Lerc/canvas_tab/main/workflows/TurboLLiteDepth.svg)
This workflow uses the ControlLLite depthmap model,   It requires creating another image in the canvas editor
with the new image button and setting the title to "Depth".  The workflow contains a canvas node with the title "Depth",  when an image matches the canvas node title the node will be updated directly from that image.

This workflow has a small sub-unit for generating a depth map from an existing Image  That subunit will sit idle unless you feed it an image,  It can be useful to refine a manually drawn depthmap by calulating a depthmap from a generated image.  Drop the generated image into this subunit to aquire a calculated depthmap.  

https://private-user-images.githubusercontent.com/139390/299817528-4285f866-c2a5-404b-8407-45d1f3167593.mp4

https://raw.githubusercontent.com/Lerc/canvas_tab/main/workflows/MultiTarget.mp4





