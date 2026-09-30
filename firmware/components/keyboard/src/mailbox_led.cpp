#include "keyboard/mailbox_led.h"

#include <algorithm>

namespace easy_codex {

easy_codex::LedWireConfig default_led_config() {
  easy_codex::LedWireConfig config{};
  for (auto& color : config.mailbox_rgb) color = {0U, 255U, 24U};
  config.mailbox_brightness = {32U, 48U, 64U, 80U, 96U, 112U, 128U, 144U,
                               160U, 176U, 192U, 208U, 224U, 240U, 248U, 255U};
  config.mailbox_level_count = 16U;
  config.task_rgb = {{{0U, 255U, 24U}, {255U, 200U, 0U}, {255U, 96U, 0U},
                      {160U, 0U, 255U}, {255U, 0U, 0U}}};
  config.task_brightness = {24U, 30U, 34U, 32U, 36U};
  config.sequence = 1U;
  return config;
}

bool mailbox_status_is_fresh(std::uint32_t now_ms,
                             std::uint32_t received_at_ms) {
  return now_ms - received_at_ms < kMailboxStatusTtlMs;
}

ai_keyboard::FeedbackColor mailbox_color_for_coverage(
    std::uint32_t coverage_count,
    const easy_codex::LedWireConfig& config,
    std::size_t slot_index) {
  if (coverage_count == 0U) {
    return {};
  }
  const auto count = std::min<std::uint32_t>(coverage_count, 16U);
  const auto levels = std::max<std::uint8_t>(config.mailbox_level_count, 1U);
  const auto level = std::min<std::uint32_t>(levels, (count * levels + 15U) / 16U);
  const auto brightness = config.mailbox_brightness[level - 1U];
  const auto color = config.mailbox_rgb[std::min(slot_index, config.mailbox_rgb.size() - 1U)];
  return {static_cast<std::uint8_t>((static_cast<unsigned>(color[0]) * brightness) / 255U),
          static_cast<std::uint8_t>((static_cast<unsigned>(color[1]) * brightness) / 255U),
          static_cast<std::uint8_t>((static_cast<unsigned>(color[2]) * brightness) / 255U)};
}

ai_keyboard::FeedbackColor task_activity_color(
    std::uint8_t running_tasks,
    const easy_codex::LedWireConfig& config) {
  const auto index = std::min<std::uint8_t>(running_tasks, 4U);
  const auto color = config.task_rgb[index];
  const auto brightness = config.task_brightness[index];
  return {static_cast<std::uint8_t>((static_cast<unsigned>(color[0]) * brightness) / 255U),
          static_cast<std::uint8_t>((static_cast<unsigned>(color[1]) * brightness) / 255U),
          static_cast<std::uint8_t>((static_cast<unsigned>(color[2]) * brightness) / 255U)};
}

std::array<ai_keyboard::FeedbackColor, 5> mailbox_frame_for_slots(
    const std::array<std::uint8_t, 4>& coverage_by_slot,
    std::uint8_t running_tasks,
    const easy_codex::LedWireConfig& config) {
  std::array<ai_keyboard::FeedbackColor, 5> frame{};
  // D1/frame 0 is the physical rightmost LED; D5/frame 4 is leftmost.
  frame[0U] = task_activity_color(running_tasks, config);
  for (std::size_t index = 0U; index < coverage_by_slot.size(); ++index) {
    frame[4U - index] = mailbox_color_for_coverage(coverage_by_slot[index], config, index);
  }
  return frame;
}

}  // namespace easy_codex
