#include "jsonl_protocol.hpp"

#include <stdexcept>

int main() {
    const auto command = talk_to_pi::JsonlProtocol::parse_command(
        R"({"v":1,"type":"start","id":"r1","sessionId":"s1","language":"de-DE"})");
    if (command.type != "start" || command.id != "r1" ||
        !command.session_id || *command.session_id != "s1" ||
        !command.language || *command.language != "de-DE") return 1;

    const auto encoded = talk_to_pi::JsonlProtocol::encode({{"v", 1}, {"type", "pong"}, {"seq", 1}});
    if (encoded.empty() || encoded.back() != '\n') return 1;

    bool rejected = false;
    try {
        (void)talk_to_pi::JsonlProtocol::parse_command(R"({"v":2,"type":"ping","id":"r1"})");
    } catch (const std::exception&) {
        rejected = true;
    }
    return rejected ? 0 : 1;
}
