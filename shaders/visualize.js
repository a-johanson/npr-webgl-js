export const fragmentVisualizeShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 out_color;

uniform sampler2D u_texture;
uniform int u_mode;

void main() {
    vec4 data = texture(u_texture, v_uv);

    if (u_mode == 0) {
        // Luminance
        out_color = vec4(vec3(data.r), 1.0);
    } else if (u_mode == 1) {
        // Surface direction (convert from [-1,1] to [0,1] for visualization)
        out_color = vec4(data.gb * 0.5 + 0.5, 0.5, 1.0);
    } else {
        // Z (normalize for visualization)
        out_color = vec4(data.a < 0.0 ? vec3(1.0, 0.0, 1.0) : vec3(1.0 - (data.a / 10.0)), 1.0);
    }
}
`;
