# NPR based on WebGL

This project is a playground for experimenting with non-photorealistic rendering (NPR) techniques in the browser, using WebGL and custom GLSL shaders. You can view a static version of the playground [on GitHub Pages](https://a-johanson.github.io/npr-webgl-js/).

## Getting Started

1. Start a local HTTP server in the project directory. For example, using Python:
	```sh
	python3 -m http.server
	```
2. Open your web browser and navigate to `http://localhost:8000`.
3. The main interface will load from `index.html` and show two canvases. The first one displays luminance/ surface direction/ depth (click to cycle) from the WebGL pass. The second canvas uses a `2d` context and outputs the NPR experiment based on the luminance, direction, and depth data.
4. To customize the GLSL fragment shader, add a new shader to `shaders/fragment/` and import it in `renderers/webgl-renderer.js`.
5. To customize the NPR rendering program, add a new program to `npr/programs/` and import it in `renderers/npr-renderer.js`.
