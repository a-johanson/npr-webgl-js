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

// Cf. https://www.shadertoy.com/view/XlGcRh and https://www.pcg-random.org/
uint pcg(uint v) {
	uint state = v * 747796405u + 2891336453u;
	uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
	return (word >> 22u) ^ word;
}

float rand(uint seed) {
    uint r = pcg(seed);
    return float(r) / float(0xffffffffu);
}

vec3 rand3(uint seed, uint stride) {
    return vec3(rand(seed), rand(seed + stride), rand(seed + 2u * stride));
}

// Cf. https://iquilezles.org/articles/distfunctions/
float sdCube(vec3 p, float a) {
  vec3 q = abs(p) - a;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

vec4 randomQuaternion(vec3 rand) {
    float sqrt1 = sqrt(1.0 - rand.x);
    float sqrt2 = sqrt(rand.x);
    float theta1 = 2.0 * M_PI * rand.y;
    float theta2 = 2.0 * M_PI * rand.z;

    float x = sqrt1 * sin(theta1);
    float y = sqrt1 * cos(theta1);
    float z = sqrt2 * sin(theta2);
    float w = sqrt2 * cos(theta2);

    return vec4(x, y, z, w);
}

// Rotates vector p by quaternion q (q must be normalized)
vec3 quatRotate(vec3 p, vec4 q) {
    vec3 t = 2.0 * cross(q.xyz, p);
    return p + q.w * t + cross(q.xyz, t);
}

// Cf. https://iquilezles.org/articles/smin/
float smin(float a, float b, float k) {
    k *= 6.0;
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * h * k * (1.0 / 6.0);
}

float scene(vec3 p) {
    const uint N = 1000u; // Number of points on the Fibonacci sphere
    const float N_f = float(N);
    const float GOLDEN_ANGLE = M_PI * (3.0 - sqrt(5.0));
    const float OBJ_RADIUS = 0.3;

    // Optimization: we only want to compute the distance to objects on the spiral points that are close to p.
    // 1. Estimate the central index i from the y-coordinate of p.
    vec3 p_norm = normalize(p);
    float i_from_y = (1.0 - p_norm.y) * (N_f - 1.0) / 2.0; // <=> y = 1 - 2 * (i / (N - 1))
    int i_approx = int(round(i_from_y));


    // 2. Calculate a search range ("corridor") of indices on the spiral.

    // To set a minimum search radius in terms of indices:
    // The surface area around each point on the unit sphere scales ~1/N.
    // Therefore, the radius around each point scales ~1/sqrt(N).
    // Any fixed size search band across the unit sphere, scales ~N in terms of indices to cover.
    // Therefore, to cover the radius around each point, we need to cover at least ~N/sqrt(N) = sqrt(N) indices.
    int min_index_radius = int(ceil(sqrt(N_f)));

    float y_dist_per_index = 2.0 / (N_f - 1.0);
    int radius_from_obj = int(ceil(1.1 * OBJ_RADIUS / y_dist_per_index));
    int index_radius = max(min_index_radius, radius_from_obj);


    // 3. Iterate over neighboring indices.
    uint i_min = uint(max(i_approx - index_radius, 0));
    uint i_max = uint(min(i_approx + index_radius, int(N) - 1));

    float fibSphere = 1.0e6;

    // 4. Check only the objects within the calculated index corridor.
    for (uint i = i_min; i <= i_max; i++) {
        float y = 1.0 - (float(i) / (N_f - 1.0)) * 2.0;
        float r = sqrt(1.0 - y * y);
        float angle = float(i) * GOLDEN_ANGLE;

        vec3 objPos = vec3(cos(angle) * r, y, sin(angle) * r);

        vec4 q = randomQuaternion(rand3(i, N));
        vec3 p_rot = quatRotate(p - objPos, q);
        float scale = rand(i + 3u * N) * 0.7 + 0.5;
        float cube = sdCube(p_rot, scale * OBJ_RADIUS);
        fibSphere = smin(fibSphere, cube, 0.02 * OBJ_RADIUS);
    }

    return fibSphere;
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
