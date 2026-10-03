#include "../ChannelLookup.h"
#include <cassert>
#include <vector>
#include <iostream>

struct Actor {};
struct Channel { Actor* actor; };

int main() {
    std::vector<Actor> actors(1000);
    std::vector<Channel> storage;
    storage.reserve(1001);
    std::vector<Channel*> channels;
    for (auto& actor : actors) storage.push_back({&actor});
    for (auto& channel : storage) channels.push_back(&channel);
    int examined = 0;
    const auto at = [&](int i) { return channels[i]; };
    const auto actorOf = [&](Channel* channel) { ++examined; return channel ? channel->actor : nullptr; };
    auto index = IndexChannels<Actor>(static_cast<int>(channels.size()), at, actorOf);
    examined = 0;
    for (int i = 0; i < 1000; ++i)
        assert(FindChannel(&actors[i], index, static_cast<int>(channels.size()), at, actorOf) == &storage[i]);
    assert(examined == 1000); // Original full scans examine 500500 channels.

    channels.erase(channels.begin()); // Every cached index is now stale.
    for (int i = 1; i < 1000; ++i)
        assert(FindChannel(&actors[i], index, static_cast<int>(channels.size()), at, actorOf) == &storage[i]);
    assert(FindChannel(&actors[0], index, static_cast<int>(channels.size()), at, actorOf) == nullptr);
    channels[0] = nullptr;
    assert(FindChannel(&actors[1], index, static_cast<int>(channels.size()), at, actorOf) == nullptr);
    channels.push_back(&storage[0]); // A channel added after indexing must still be found.
    assert(FindChannel(&actors[0], index, static_cast<int>(channels.size()), at, actorOf) == &storage[0]);
    channels.clear();
    assert(FindChannel(&actors[0], index, 0, at, actorOf) == nullptr);
    std::cout << "channel lookup: steady-state lookup count and mutation checks passed\n";
}
