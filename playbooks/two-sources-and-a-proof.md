# Two sources and a proof

A single gauge can be wrong and you would never know. Two gauges that were built differently and still agree are evidence. That is the whole method: before a number goes into a decision, a second independent source has to land near it, and a physical limit has to bound it.

This matters most when the question comes from a manager and the answer moves money: "Is the circuit full?", "Was that device really offline?", "How many endpoints will this policy touch?"

## Pick both sources before writing code

| Question | First source | Independent second source | Not a source |
|---|---|---|---|
| How fast was a host sending in a past window | Controller interface history for its switch port | Controller per client byte counters | A monitor that was not watching that port at the time |
| Where is a host plugged in now | Switch device tracking table | Controller client lookup, policy server live session | Ping. Many devices never answer it |
| Where was it plugged in last week | Policy server authentication history, which records switch and port per authentication | Controller client history | An inventory sheet. It is a snapshot |
| Who is this endpoint | Policy server endpoint record | Controller client record, MAC vendor prefix | A DHCP host name alone |
| Which rule, tag and VLAN did it get | Policy server authentication history | The switch's own session detail for the port | The controller |
| Load on a shared uplink | Controller history on the uplink itself | An independent sampler, or the carrier's graph | Adding host rates together |

## The proofs

Every run prints these as PASS or CHECK. CHECK does not mean wrong. It means a person looks before the number is used.

- **Reference value.** One value already known from another day or another tool comes out the same.
- **Two sources.** The ratio between the two independent measurements is inside 0.8 to 1.25.
- **Physics bound.** The parts do not add up to more than the whole. Hosts cannot send more than their uplink carried.
- **Identity.** Controller, policy server and switch all name the same port for the same device.

## Things the APIs did that the documents did not warn about

Field observations on Catalyst Center 3.2.3 and ISE 3.4. Check them on your version before relying on them.

- A lookup by switch hostname returned zero rows. The same lookup by management address returned everything. The first run reported "no data" for ports that did have history.
- The specification names a field `rxRate`. The appliance returned `RXRATE`. A case sensitive parser dropped every point.
- The plain history attribute is the latest sample in each interval, and it is not stable. For one hourly bucket it changed by more than a third between two pulls a day apart, while the aggregate average for the same bucket moved by under one percent. Report average and maximum from the aggregate fields and label them.
- An interface name has two spellings. The API wants `TenGigabitEthernet6/0/40`, the switch prints `Te6/0/40`, and a string compare never matches them.
- History calls page at a fixed size and some refuse a window longer than seven days. Ask in windows, follow the cursor to the end, de-duplicate on timestamp.
- A list call sorted by name and capped by offset silently returned only the alphabetically first results. Counts came from the summary endpoint instead.

Every one of these was found because the raw replies were on disk and could be read again.

## What it bought

Held uploads and paused jobs had been blamed on the network. Controller interface history on the cloud circuit and the carrier's own graphs agreed: the dedicated circuit was saturated on weekends. A larger circuit was approved the same day the analysis was finished. Nobody had to take the number on trust.

The proof helpers are in [templates/netops_gates_and_proofs.py](templates/netops_gates_and_proofs.py).
