# CICD Server Component

[CICD V4](https://github.com/bmoers/sn-cicd/tree/release/4) needs this Update-Set to be installed to work.

For [CICD V3](https://github.com/bmoers/sn-cicd/tree/release/3) please refer to the latest V3 release https://github.com/bmoers/sn-cicd-integration/releases/tag/v1.3.16


To convert this to run under your company namespace run
```
node_modules/.bin/gulp namespace --name your-name-space
```

Please note: the namespace must also be set in the CICD_APP_PREFIX env variable (in .env in the sn-cicd project)
