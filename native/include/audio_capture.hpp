#pragma once

#include <atomic>
#include <cmath>
#include <cstddef>
#include <mutex>
#include <string>
#include <vector>

#include <miniaudio.h>

namespace talk_to_pi {

inline float audio_rms(const float* samples, std::size_t count) {
    if (!samples || count == 0) return 0.0F;
    double sum_squares = 0.0;
    for (std::size_t index = 0; index < count; ++index) {
        const double sample = samples[index];
        sum_squares += sample * sample;
    }
    return static_cast<float>(std::sqrt(sum_squares / count));
}

class AudioRingBuffer {
public:
    explicit AudioRingBuffer(std::size_t capacity_samples);

    std::size_t push(const float* samples, std::size_t count);
    std::size_t pop(float* destination, std::size_t count);
    void clear();
    std::size_t available() const;
    std::size_t dropped_samples() const { return dropped_samples_.load(); }

private:
    std::vector<float> data_;
    const std::size_t capacity_;
    std::atomic<std::size_t> read_index_{0};
    std::atomic<std::size_t> write_index_{0};
    std::atomic<std::size_t> dropped_samples_{0};
};

class AudioCapture {
public:
    explicit AudioCapture(AudioRingBuffer& ring) : ring_(ring) {}
    ~AudioCapture();

    bool start(std::string& error);
    void stop();
    bool running() const { return running_; }
    float level() const { return level_.load(std::memory_order_relaxed); }

private:
    static void data_callback(ma_device* device, void* output, const void* input,
                              ma_uint32 frame_count);

    AudioRingBuffer& ring_;
    ma_device device_{};
    bool initialized_ = false;
    std::atomic<bool> running_{false};
    std::atomic<float> level_{0.0F};
    std::mutex lifecycle_mutex_;
};

} // namespace talk_to_pi
