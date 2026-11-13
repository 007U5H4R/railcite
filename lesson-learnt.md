# Lesson learnt

**What went wrong:** the Replicate/restoration job flow was first drafted as a synchronous
request from the browser straight to the model endpoint, which works fine locally against a
mocked response but breaks the moment it hits a real cold-started model: inference regularly
takes 10–60s, well past any reasonable HTTP timeout, and a model endpoint can't call back into
`localhost` to notify a dev machine when it's done anyway.

**Root cause:** the design assumed "call an API, get a result" without separating "start a job"
from "learn the job finished." Those are two different operations with two different latency
profiles, and collapsing them into one request hides that until the request actually times out
under real latency.

**The fix:** split the flow into three steps — upload the input via `replicate.files.create()`
so the model has something stable and already-hosted to look at, kick off the prediction and
get back a job id immediately, then poll a dedicated `jobs/:id` status endpoint from the
frontend until the job resolves. The upload step turned out to matter as much as the polling
step: without it, the submit call itself was the slow, timeout-prone part.

**How to apply next time:** whenever a request wraps a call to infra you don't control and
that infra's latency is untested or unbounded, assume synchronous won't survive contact with
the real service. Design the async split (submit → poll, or submit → webhook) before writing
the happy-path code, not after the first timeout in integration testing.
