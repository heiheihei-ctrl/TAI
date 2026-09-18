# API usage channel groups

- The admin API usage table groups product routes: normal = ToAPIs, stable = Tencent. Tencent includes official Volcengine/Seedance routes by product definition, not physical upstream ownership.
- Task identity and execution metadata take precedence over request hints. Unknown routes display `-` instead of guessing from model names.
- Original vendor/platform fields and billing rules remain unchanged. Historical records are resolved on display; no database backfill is performed.
- Video execution wrappers preserve metadata returned by the actual adapter instead of overwriting it with configured vendor keys.