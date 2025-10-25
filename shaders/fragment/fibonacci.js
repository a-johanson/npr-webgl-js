export const fragmentShader = `#version 300 es
precision highp float;

#define M_PI 3.14159265358979323846

in vec2 v_uv;
out vec4 outLdz;

uniform float u_aspect; // Aspect ratio

// SDF for a sphere
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

// Cf. https://iquilezles.org/articles/smin/
float smin(float a, float b, float k) {
    k *= 6.0;
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * h * k * (1.0 / 6.0);
}

float scene(vec3 p) {
    const float N = 200.0; // Number of points on the Fibonacci sphere
    const float GOLDEN_ANGLE = M_PI * (3.0 - sqrt(5.0));
    const float OBJ_RADIUS = 0.25;

    // Optimization: we only want to compute the distance to objects on the spiral points that are close to p.
    // 1. Estimate the central index i from the y-coordinate of p.
    vec3 p_norm = normalize(p);
    float i_from_y = (1.0 - p_norm.y) * (N - 1.0) / 2.0; // <=> y = 1 - 2 * (i / (N - 1))
    int i_approx = int(round(i_from_y));


    // 2. Calculate a search range ("corridor") of indices on the spiral.

    // To set a minimum search radius in terms of indices:
    // The surface area around each point on the unit sphere scales ~1/N.
    // Therefore, the radius around each point scales ~1/sqrt(N).
    // Any fixed size search band across the unit sphere, scales ~N in terms of indices to cover.
    // Therefore, to cover the radius around each point, we need to cover at least ~N/sqrt(N) = sqrt(N) indices.
    int min_index_radius = int(ceil(sqrt(N)));

    float y_dist_per_index = 2.0 / (N - 1.0);
    int radius_from_obj = int(ceil(1.1 * OBJ_RADIUS / y_dist_per_index));
    int index_radius = max(min_index_radius, radius_from_obj);


    // 3. Iterate over neighboring indices.
    int i_min = max(i_approx - index_radius, 0);
    int i_max = min(i_approx + index_radius, int(N) - 1);

    float fibSphere = 1.0e6;

    // 4. Check only the spheres within the calculated index corridor.
    for (int i = i_min; i <= i_max; i++) {
        float y = 1.0 - (float(i) / (N - 1.0)) * 2.0;
        float r = sqrt(1.0 - y * y);
        float angle = float(i) * GOLDEN_ANGLE;

        vec3 spherePos = vec3(cos(angle) * r, y, sin(angle) * r);
        fibSphere = smin(fibSphere, sdSphere(p - spherePos, OBJ_RADIUS), 0.01 * OBJ_RADIUS);
    }

    return max(-fibSphere, sdSphere(p, 1.0));
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
    const vec3 camPos = vec3(0.0, 0.0, 3.0);
    const vec3 camTarget = vec3(0.0, 0.0, 0.0);
    const vec3 camUp = vec3(0.0, 1.0, 0.0);

    // Camera basis
    const vec3 camForward = normalize(camTarget - camPos);
    const vec3 camRight = normalize(cross(camForward, camUp));
    const vec3 camTrueUp = cross(camRight, camForward);

    const float fov = 35.0 * M_PI / 180.0;
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
