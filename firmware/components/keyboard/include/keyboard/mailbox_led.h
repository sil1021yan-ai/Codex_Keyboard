#pragma once

#include <array>
#include <cstdint>

#include "keyboard/input_feedback.h"
#include "keyboard/codex_playback_wire.h"

namespace easy_codex {

constexpr std::uint32_t kMailboxStatusTtlMs = 10000U;

easy_codex::LedWireConfig default_led_config();

bool mailbox_status_is_fresh(std::uint32_t now_ms,
                             std::uint32_t received_at_ms);

ai_keyboard::FeedbackColor mailbox_color_for_coverage(
    std::uint32_t coverage_count,
    const easy_codex::LedWireConfig& config = default_led_config(),
    std::size_t slot_index = 0U);

ai_keyboard::FeedbackColor task_activity_color(
    std::uint8_t running_tasks,
    const easy_codex::LedWireConfig& config = default_led_config());

std::array<ai_keyboard::FeedbackColor, 5> mailbox_frame_for_slots(
    const std::array<std::uint8_t, 4>& coverage_by_slot,
    std::uint8_t running_tasks,
    const easy_codex::LedWireConfig& config = default_led_config());

}  // namespace easy_codex
