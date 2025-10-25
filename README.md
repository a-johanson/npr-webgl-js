# NPR based on WebGL

This project is a playground for experimenting with non-photorealistic rendering (NPR) techniques in the browser, using WebGL and custom GLSL shaders.

## Getting Started

1. Start a local HTTP server in the project directory. For example, using Python:
```sh
python3 -m http.server
```
2. Open your web browser and navigate to `http://localhost:8000`.
3. The main interface will load from `index.html` and show two canvases. The first one displays luminance/ surface orientation/ depth (click to cycle) from the WebGL pass. The second canvas uses a `2d` context and outputs the NPR experiment based on the luminance, orientation, and depth data.
4. To customize the GLSL fragment shader, add a new shader to `shaders/fragment` and import it in `index.js`.
5. To customize the NPR render, adapt `renderFromLDZ` defined in `render-2d.js`.
