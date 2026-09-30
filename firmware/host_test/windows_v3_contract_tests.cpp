#include "keyboard/audio_packet_wire.h"
#include "keyboard/audio_control_wire.h"
#include "keyboard/codex_playback_wire.h"
#include "speaker_assets/speaker_assets_wifi_wire.h"
#include <openssl/hmac.h>
#include <algorithm>
#include <array>
#include <cassert>
#include <fstream>
#include <map>
#include <string>
#include <vector>

using Bytes = std::vector<std::uint8_t>;

int main(int argc, char** argv) {
  assert(argc == 2);
  std::ifstream input(argv[1]);
  assert(input.is_open());
  std::map<std::string, Bytes> vectors;
  std::string line;
  while (std::getline(input, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty() || line.front() == '#') continue;
    const auto split = line.find('=');
    assert(split != std::string::npos);
    const auto hex = line.substr(split + 1);
    assert(hex.size() % 2 == 0);
    Bytes decoded;
    for (std::size_t index = 0; index < hex.size(); index += 2) {
      decoded.push_back(static_cast<std::uint8_t>(std::stoul(hex.substr(index, 2), nullptr, 16)));
    }
    assert(vectors.emplace(line.substr(0, split), decoded).second);
  }
  assert(vectors.size() == 5);
  assert(vectors.at("key").size() == 32);
  std::array<std::uint8_t, 32> key{};
  std::copy(vectors.at("key").begin(), vectors.at("key").end(), key.begin());

  for (bool terminal : {false, true}) {
    Bytes packet(terminal ? 32 : 672, 0x5a);
    if (terminal) {
      const ai_keyboard::AudioEndMetadata metadata{0xec20000700000009ULL, 17, 16000, 340};
      assert(ai_keyboard::encode_audio_end_header(packet.data(), packet.size(), metadata));
    } else {
      const ai_keyboard::AudioPacketMetadata metadata{0xec20000700000009ULL, 17, 16000, 340, 320, 640};
      assert(ai_keyboard::encode_audio_packet_header(packet.data(), packet.size(), metadata));
    }
    // Production keyboard_audio.cpp uses mbedTLS HMAC-SHA256. This desktop
    // test uses OpenSSL for that same operation, not the ESP runtime path.
    std::array<unsigned char, 32> digest{};
    unsigned int length = 0;
    assert(HMAC(EVP_sha256(), key.data(), static_cast<int>(key.size()),
                packet.data(), packet.size(), digest.data(), &length) != nullptr);
    assert(length == 32);
    packet.insert(packet.end(), digest.begin(), digest.begin() + 16);
    assert(packet == vectors.at(terminal ? "end" : "frame"));
  }

  std::array<std::uint8_t, 80> heartbeat{};
  assert(ai_keyboard::encode_heartbeat(heartbeat.data(), {false, true}, 0, 17) == 20);
  namespace assets = easy_input::speaker_assets;
  assets::SpeakerAssetsWifiDiscovery discovery{};
  discovery.flags = 7;
  discovery.port = 17334;
  discovery.key_epoch = 1;
  for (std::size_t index = 0; index < 16; ++index) {
    discovery.device_id[index] = static_cast<std::uint8_t>(index);
    discovery.endpoint_nonce[index] = static_cast<std::uint8_t>(index + 16);
  }
  assert(assets::encode_speaker_assets_wifi_discovery(heartbeat.data(), heartbeat.size(), discovery, key, true));
  assert(Bytes(heartbeat.begin(), heartbeat.end()) == vectors.at("heartbeat"));

  easy_codex::MailboxWireStatus mailbox{};
  assert(easy_codex::decode_mailbox_status(
      vectors.at("mailbox").data(), vectors.at("mailbox").size(), key,
      &mailbox));
  assert(mailbox.unread_slots == 0b0101);
  assert(mailbox.running_tasks == 3);
  assert(mailbox.heartbeat_sequence == 0x11223344U);
  assert((mailbox.coverage_by_slot ==
          std::array<std::uint8_t, 4>{7U, 0U, 2U, 0U}));
  return 0;
}
