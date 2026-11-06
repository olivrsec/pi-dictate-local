#include "audio_capture.hpp"

#include <cmath>

int main() {
    const float samples[] = {0.5F, -0.5F, 0.5F, -0.5F};
    if (std::abs(talk_to_pi::audio_rms(samples, 4) - 0.5F) >= 1e-6F) return 1;
    if (talk_to_pi::audio_rms(samples, 0) != 0.0F) return 1;
    if (talk_to_pi::audio_rms(nullptr, 4) != 0.0F) return 1;
    return 0;
}
