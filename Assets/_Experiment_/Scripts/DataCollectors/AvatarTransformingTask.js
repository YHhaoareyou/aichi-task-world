/*
# Available Variables in LUIDA Data Collector Script

The script for LUIDA Data Collector is primarily to be written using ClusterScript (https://docs.cluster.mu/script/index.html).

We also provide the following variables that work with LUIDA-only features.

Tip: When asking an LLM service for coding assistance, first share the `Asset/Doc/CCK-Types.d.ts` file and this comment section with it.

### CONDITION
    - Only available if **LUIDA experiment progress automation feature is enabled and during the trial states** (e.g., `Trial - Start`, `Trial - Rest`).
    - Contains values from your configured experimental variables for the current trial.
    - Use `CONDITION["your_variable_name"]` to retrieve a specific condition value within the current trial.

### PARTICIPANTS
    - An array of PlayerHandle of the participants joining this experiment."
    - Use `PARTICIPANTS[1]` to retrieve the first participant, `PARTICIPANTS[2]` to retrieve the second participant, etc.

### COLLECTED_DATA
    - Contains data that are sent from state-listening items' `Send Data To Collector` action or a customized action script's `SendDataToCollector("your_data_label", your_data_value)` function.
    - Use `COLLECTED_DATA["your_data_label"]` to retrieve specific values.

---

**Important Note:** The script **must return a value** at the end of its code block.

Examples:
    - return { score: 100 };`
    - const answer = $.getStateCompat('global', 'count', 'integer') > 5; return { isLarger: answer };`
*/
return {
    stateLog: COLLECTED_DATA ? COLLECTED_DATA["stateLog"] : "", // Include log of the current state by default (state name, id, and the timestamp when the state starts)
    cond: CONDITION || {}, // Include conditions in the collected data by default (if you have enabled the experiment automation feature)
    someCckState: $.getStateCompat("global", "someCckState", "boolean"), // Replace with your in-scene state triggered by CCK components
    foo: 'bar' // Replace with your custom collected data
};
