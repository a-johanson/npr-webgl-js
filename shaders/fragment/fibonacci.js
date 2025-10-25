export const fragmentShader = `#version 300 es
precision highp float;

#define M_PI 3.14159265358979323846

in vec2 v_uv;
out vec4 outLdz;

uniform float u_aspect; // Added uniform for aspect ratio correction

// SDF for a sphere
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float scene(vec3 p) {
    const int N = 100;
    float minDist = 1e5;
    for (int i = 0; i < N; i++) {
        float angle = float(i) * M_PI * (3.0 - sqrt(5.0)); // Golden angle in radians
        float y = 1.0 - (float(i) / float(N - 1)) * 2.0; // y goes from 1 to -1
        float r = sqrt(1.0 - y * y); // radius at y
        vec3 spherePos = vec3(cos(angle) * r, y, sin(angle) * r);
        minDist = min(minDist, sdSphere(p - spherePos, 0.25));
    }
    return minDist;
}

// Cf. https://iquilezles.org/articles/normalsSDF/
vec3 calcNormal(vec3 p) {
    const float h = 0.001;
    const vec2 k = vec2(1, -1);
    return normalize( k.xyy * scene(p + k.xyy * h) + 
                      k.yyx * scene(p + k.yyx * h) + 
                      k.yxy * scene(p + k.yxy * h) + 
                      k.xxx * scene(p + k.xxx * h));
}

void main() {
    // Ray setup
    vec2 uv = v_uv * 2.0 - 1.0;

    // Light setup
    const vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));

    // Camera setup
    const vec3 camPos = vec3(0.0, 0.0, 5.0);
    const vec3 camTarget = vec3(0.0, 0.0, 0.0);
    const vec3 camUp = vec3(0.0, 1.0, 0.0);

    // Camera basis
    const vec3 camForward = normalize(camTarget - camPos);
    const vec3 camRight = normalize(cross(camForward, camUp));
    const vec3 camTrueUp = cross(camRight, camForward);

    const float fov = 40.0 * M_PI / 180.0;
    const float fov_scale = tan(0.5 * fov);

    vec3 rayDir = normalize(
        camRight * uv.x * u_aspect * fov_scale +
        camTrueUp * uv.y * fov_scale +
        camForward
    );
    
    // Ray marching
    const float maxDist = 50.0;
    const int maxSteps = 200;
    const float epsilon = 0.001;
    const float orientationOffset = 0.5 * M_PI;
    const float stepScale = 1.0;

    float luminance = 0.0;
    vec2 surfaceDirection = vec2(0.0);
    float zValue = -1.0;

    float t = 0.0;
    vec4 hitPos = vec4(0.0, 0.0, 0.0, -1.0);

    for (int i = 0; i < maxSteps; i++) {
        vec3 p = camPos + rayDir * t;
        float d = scene(p);

        if (d < epsilon) {
            vec3 normal = calcNormal(p);
            vec3 pRelative = p - camPos;
            
            // Simple lighting (luminance)
            float normalAmount = dot(normal, lightDir);
            luminance = max(0.0, normalAmount) * 0.8 + 0.2;

            // Compute surface orientation and project to image plane
            vec3 a = normalize(lightDir - normalAmount * normal);
            vec3 b = cross(normal, a);
            vec3 abDir = cos(orientationOffset) * a + sin(orientationOffset) * b;
            vec3 pPlus  = pRelative + epsilon * abDir;
            vec3 pMinus = pRelative - epsilon * abDir;

            vec2 pPlusClip = vec2(dot(pPlus, camRight), dot(pPlus, camTrueUp));
            vec2 pMinusClip = vec2(dot(pMinus, camRight), dot(pMinus, camTrueUp));

            surfaceDirection = normalize(pPlusClip - pMinusClip);

            zValue = dot(pRelative, camForward);

            hitPos = vec4(p, t);

            break;
        }

        if (t > maxDist) break;

        t += stepScale * d;
    }

    outLdz = vec4(luminance, surfaceDirection, zValue);
}
`;
