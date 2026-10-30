// Verbatim density/hash/gradient functions from Photon 6e67b36.
// sky/clouds/{cirrus,common}.glsl and utility/random.glsl.
// Retains Photon license; see public/licenses/photon.txt.

vec2 hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec2 perlin_gradient(vec2 coord) {
    vec2 i = floor(coord);
    vec2 f = fract(coord);

    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

    vec2 g0 = hash2(i + vec2(0.0, 0.0));
    vec2 g1 = hash2(i + vec2(1.0, 0.0));
    vec2 g2 = hash2(i + vec2(0.0, 1.0));
    vec2 g3 = hash2(i + vec2(1.0, 1.0));

    float v0 = dot(g0, f - vec2(0.0, 0.0));
    float v1 = dot(g1, f - vec2(1.0, 0.0));
    float v2 = dot(g2, f - vec2(0.0, 1.0));
    float v3 = dot(g3, f - vec2(1.0, 1.0));

    return vec2(
        g0 + u.x * (g1 - g0) + u.y * (g2 - g0) + u.x * u.y * (g0 - g1 - g2 + g3)
        + // d/dx
        du * (u.yx * (v0 - v1 - v2 + v3) + vec2(v1, v2) - v0) // d/dy
    );
}

vec2 curl2D(vec2 coord) {
    vec2 gradient = perlin_gradient(coord);
    return vec2(gradient.y, -gradient.x);
}

float clouds_cirrus_density(vec2 coord, float altitude_fraction) {
    const float wind_angle = CLOUDS_CIRRUS_WIND_ANGLE * degree;
    const vec2 wind_velocity
        = CLOUDS_CIRRUS_WIND_SPEED * vec2(cos(wind_angle), sin(wind_angle));

    coord = coord + cameraPosition.xz * CLOUDS_SCALE;
    coord = coord + wind_velocity * world_age;

    vec2 curl = curl2D(0.00002 * coord) * 0.5 + curl2D(0.00004 * coord) * 0.25
        + curl2D(0.00008 * coord) * 0.125;

    float height_shaping = 1.0 - abs(1.0 - 2.0 * altitude_fraction);

    // Cirrus

    float density_cirrus = 0.7
            * texture(
                  noisetex,
                  (0.000001 / CLOUDS_CIRRUS_SIZE) * coord
                      + (0.004 * CLOUDS_CIRRUS_CURL_STRENGTH) * curl
            )
                  .x
        + 0.3
            * texture(
                  noisetex,
                  (0.000008 / CLOUDS_CIRRUS_SIZE) * coord
                      + (0.008 * CLOUDS_CIRRUS_CURL_STRENGTH) * curl
            )
                  .x;
    density_cirrus
        = linear_step(0.7 - clouds_params.cirrus_amount, 1.0, density_cirrus);

    vec2 detail_coord = coord;

    float detail_amplitude = 0.2;
    float detail_frequency = 0.00002;
    float curl_strength = 0.1 * CLOUDS_CIRRUS_CURL_STRENGTH;

    for (int i = 0; i < 4; ++i) {
        float detail
            = texture(
                  noisetex,
                  detail_coord * detail_frequency + curl * curl_strength
            )
                  .x;

        density_cirrus -= detail * detail_amplitude;

        detail_amplitude *= 0.6;
        detail_frequency *= 2.0;
        curl_strength *= 4.0;

        detail_coord += 0.3 * wind_velocity * world_age;
    }

    density_cirrus = mix(1.0, 0.75, day_factor) * cube(max0(density_cirrus))
        * sqr(height_shaping) * CLOUDS_CIRRUS_DENSITY;

    // Cirrocumulus

    float coverage = texture(
                         noisetex,
                         (0.0000026 / CLOUDS_CIRROCUMULUS_SIZE) * coord + 0.25
    )
                         .w;
    coverage = 5.0
        * linear_step(0.25, 0.9, clouds_params.cirrocumulus_amount * coverage);

    float density_cirrocumulus
        = dampen(texture(
                     noisetex,
                     (0.000025 * rcp(CLOUDS_CIRROCUMULUS_SIZE)) * coord
                         + (0.033 * CLOUDS_CIRROCUMULUS_CURL_STRENGTH) * curl
        )
                     .w);
    density_cirrocumulus
        = linear_step(1.0 - coverage, 1.0, density_cirrocumulus);

    vec2 curl_cc = curl2D(0.001 * coord);

    density_cirrocumulus
        -= sqr(texture(
                   noisetex,
                   coord * 0.00005
                       + (0.003 * CLOUDS_CIRROCUMULUS_CURL_STRENGTH) * curl_cc
           )
                   .y)
        * (CLOUDS_CIRROCUMULUS_DETAIL_STRENGTH * 1.0);
    density_cirrocumulus
        -= sqr(texture(
                   noisetex,
                   coord * 0.0002
                       + (0.007 * CLOUDS_CIRROCUMULUS_CURL_STRENGTH) * curl_cc
           )
                   .y)
        * (CLOUDS_CIRROCUMULUS_DETAIL_STRENGTH * 0.5);
    density_cirrocumulus
        -= sqr(texture(
                   noisetex,
                   coord * 0.0008
                       + (0.03 * CLOUDS_CIRROCUMULUS_CURL_STRENGTH) * curl_cc
           )
                   .y)
        * (CLOUDS_CIRROCUMULUS_DETAIL_STRENGTH * 0.1);

    density_cirrocumulus = max0(density_cirrocumulus);

    density_cirrocumulus = 0.25 * pow4(max0(density_cirrocumulus))
        * height_shaping * CLOUDS_CIRROCUMULUS_DENSITY;

    return density_cirrus + density_cirrocumulus;
}
