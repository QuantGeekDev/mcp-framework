# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.2.12](https://github.com/QuantGeekDev/mcp-framework/compare/mcp-framework-v0.2.11...mcp-framework-v0.2.12) (2025-04-08)

### Documentation

* Add detailed usage examples and explanation for `MCPClient`.
* Document WebSockets transport support and configuration.


## [0.2.11](https://github.com/QuantGeekDev/mcp-framework/compare/mcp-framework-v0.2.10...mcp-framework-v0.2.11) (2025-03-30)


### Features

* implement resources/templates/list handler ([ff73ff0](https://github.com/QuantGeekDev/mcp-framework/commit/ff73ff084860c12a0aae15757c39ab6eeef5a543))
* implement resources/templates/list handler ([0dabfc0](https://github.com/QuantGeekDev/mcp-framework/commit/0dabfc04370535ecbe9d31f4d2b54ac876032b93))

## [0.2.10](https://github.com/QuantGeekDev/mcp-framework/compare/mcp-framework-v0.2.9...mcp-framework-v0.2.10) (2025-03-30)


### Features

* add optional skip install param ([d77e6e9](https://github.com/QuantGeekDev/mcp-framework/commit/d77e6e9df5a6d989dc7fbfa25b2cbe3b56e50260))
* add optional skip install param ([318dbc7](https://github.com/QuantGeekDev/mcp-framework/commit/318dbc798e673678c38a468e6a898e9834cdfa7d))
* add skip example option to cli ([df733f9](https://github.com/QuantGeekDev/mcp-framework/commit/df733f999e9837012220a7696d993ef734eee393))
* add skip example option to cli ([c02809f](https://github.com/QuantGeekDev/mcp-framework/commit/c02809f185270bdc462f367b3a0e52a6e4d4300d))


### Bug Fixes

* Fixes ESLint 'no-case-declarations' error in HTTP transport by adding block scope to the default switch case. ([25ed8e6](https://github.com/QuantGeekDev/mcp-framework/commit/25ed8e6de845f72ea2967ff64b981e445ae48249))
* make ping conform with the spec ([aa46eb8](https://github.com/QuantGeekDev/mcp-framework/commit/aa46eb8199c95e4b1024e84d5a616e0cc420cd64))
* **transports:** Conform SSE/HTTP streams to MCP spec and improve logging ([9d9ef2a](https://github.com/QuantGeekDev/mcp-framework/commit/9d9ef2aa2ddea52c37133d4842d95d168ea5e190))
* **transports:** follow spec guideline ([208599d](https://github.com/QuantGeekDev/mcp-framework/commit/208599ddaafbf58eddaf4d5d6492a26e1effbbc6))

## [0.2.9](https://github.com/QuantGeekDev/mcp-framework/compare/mcp-framework-v0.2.8...mcp-framework-v0.2.9) (2025-03-29)


### Features

* add linting ([e71ebb5](https://github.com/QuantGeekDev/mcp-framework/commit/e71ebb5d538cb03510633bac0cf41bd318a0eab9))
* add linting ([181e634](https://github.com/QuantGeekDev/mcp-framework/commit/181e634da0cf97f2f40ae8b7e4fd4e74935a1c3c))
* add sse resumability ([4b47edb](https://github.com/QuantGeekDev/mcp-framework/commit/4b47edb243286a9f32bb81655bd0b51c2c4695e2))
* add sse resumability ([e20b7cc](https://github.com/QuantGeekDev/mcp-framework/commit/e20b7cc887dd4b080d38e01d21ac2ef3e63843d1))
* improve error handling for sse ([a5644af](https://github.com/QuantGeekDev/mcp-framework/commit/a5644af425563aca22fdf46ec24b1f547a5d9143))
* improve error handling for sse ([ba1646b](https://github.com/QuantGeekDev/mcp-framework/commit/ba1646be8da98c4d86b55313c515903c692d8f9f))


### Bug Fixes

* close sse stream after post ([eef96b4](https://github.com/QuantGeekDev/mcp-framework/commit/eef96b4c429af9c2f7083352c4bd45d645927352))
* close sse stream after post ([d6ea60d](https://github.com/QuantGeekDev/mcp-framework/commit/d6ea60deb5283551ce9730e2d20e38ffe8f6c711))
* detect tools capability using toolLoader ([c5d34a5](https://github.com/QuantGeekDev/mcp-framework/commit/c5d34a5be034ee0fb22e888d7696d64ac703e727))
* detect tools capability using toolLoader ([1e4c71f](https://github.com/QuantGeekDev/mcp-framework/commit/1e4c71f71634a72b7c146d84a21582e6e9d5fd3b))
* enforce that initialize request cannot be part of JSON-RPC batch ([452740c](https://github.com/QuantGeekDev/mcp-framework/commit/452740c9bdba8df014a4cd3d5149e78190c05058))
* enforce that initialize request cannot be part of JSON-RPC batch ([6cccf54](https://github.com/QuantGeekDev/mcp-framework/commit/6cccf54c18a6554c243d7dfdc286dcc3e92cb75f))
* import path utilities to resolve build errors ([5a7672c](https://github.com/QuantGeekDev/mcp-framework/commit/5a7672cca08dc21d527dc1d4b6a9cbdf809938bc))
* import path utilities to resolve build errors ([534d0de](https://github.com/QuantGeekDev/mcp-framework/commit/534d0de047e3d29f214b088c8fdad2d25444b344))
* project validation not working on windows ([fc506d3](https://github.com/QuantGeekDev/mcp-framework/commit/fc506d3b13a7c8c25647f6d2d8b278fa25e22ea5))

## [0.2.8](https://github.com/QuantGeekDev/mcp-framework/compare/mcp-framework-v0.2.7...mcp-framework-v0.2.8) (2025-03-28)


### Features

* add auth ([6338d14](https://github.com/QuantGeekDev/mcp-framework/commit/6338d14b6b8ad020ab41b2c2d3cf843d660db2fc))
* add Base Tool ([6b51594](https://github.com/QuantGeekDev/mcp-framework/commit/6b51594aaaedf0c13c418055d2b2039e919cc2d3))
* add basic sse support ([e8b808f](https://github.com/QuantGeekDev/mcp-framework/commit/e8b808f1967a9255a94cb9922169724e0a0bb145))
* add build before start. this one is for you, vibe coders ;) ([fa43fa8](https://github.com/QuantGeekDev/mcp-framework/commit/fa43fa81195981688adf30689d1cbd65fdb29892))
* add cli tool ([91101ee](https://github.com/QuantGeekDev/mcp-framework/commit/91101ee9671eb8489d7cb69d2b596d201a204cb1))
* add cors configuration ([5d3f27f](https://github.com/QuantGeekDev/mcp-framework/commit/5d3f27f0f2ce61551b1c66dbf9d3aa7f640606ff))
* add execa ([4d44864](https://github.com/QuantGeekDev/mcp-framework/commit/4d44864db3abbd41cbf02da380c597e92d2de39d))
* add execa ([d68cfb6](https://github.com/QuantGeekDev/mcp-framework/commit/d68cfb6b43034893a6de3018793164d5d334f5fe))
* add find-up ([09c767f](https://github.com/QuantGeekDev/mcp-framework/commit/09c767fe82dbf53403543905f8e056a9e2c9a3df))
* add find-up ([9f90df9](https://github.com/QuantGeekDev/mcp-framework/commit/9f90df97a5cf3777a5910c0a806a6fbc70dee61e))
* Add HTTP Stream transport with improved session handling and CORS support ([04ff8a5](https://github.com/QuantGeekDev/mcp-framework/commit/04ff8a5453b56e912d157356bb05a8cb6c987c41))
* add image support ([ab023ba](https://github.com/QuantGeekDev/mcp-framework/commit/ab023ba082af9d7e560a498e1e77b93e69331d74))
* add image support ([9c8ca20](https://github.com/QuantGeekDev/mcp-framework/commit/9c8ca201f792a2386b112e67d1e664ca78d2e2d1))
* add index ([62873b9](https://github.com/QuantGeekDev/mcp-framework/commit/62873b9fb67d41cff0fdca647b4d1a0ff4d35e6b))
* add keywords to package ([95ea9a7](https://github.com/QuantGeekDev/mcp-framework/commit/95ea9a7adb25fb5dd844a944ef1a5cc7ccfaeb25))
* Add LICENSE ([2d3612a](https://github.com/QuantGeekDev/mcp-framework/commit/2d3612a89dcd27b1567480378b318eeb8e838863))
* add logging ([d637a65](https://github.com/QuantGeekDev/mcp-framework/commit/d637a6560b17b09c5383b6b1ca7838f08c5fc780))
* add mcp-build cli ([27cb517](https://github.com/QuantGeekDev/mcp-framework/commit/27cb517306deaf2b34646d9b2ac617dc70c476f5))
* add MCPServer ([807f04d](https://github.com/QuantGeekDev/mcp-framework/commit/807f04ddbfe28598bb26c0dce640dcc0909d739a))
* add MCPTool abstraction ([4d5fb39](https://github.com/QuantGeekDev/mcp-framework/commit/4d5fb398efd4a253f1ea23e8307690ecb84f8009))
* add MCPTool abstraction ([3458e78](https://github.com/QuantGeekDev/mcp-framework/commit/3458e78233437c9afd71b9195424659e62aa08f3))
* add prompt capabilities ([9ca6a0f](https://github.com/QuantGeekDev/mcp-framework/commit/9ca6a0fc19638c2428c060bdb3996d49c5c31e55))
* add prompt capabilities ([019f409](https://github.com/QuantGeekDev/mcp-framework/commit/019f40949ea66fc4d1ca1969aaa57c8943e81036))
* add readme ([752024e](https://github.com/QuantGeekDev/mcp-framework/commit/752024ed92213c3c27a2b9a5a702f823e835e167))
* add README ([b0a371c](https://github.com/QuantGeekDev/mcp-framework/commit/b0a371c1b3a6275d249fdd89e67d7d791b573601))
* add release-please workflow ([eb6c121](https://github.com/QuantGeekDev/mcp-framework/commit/eb6c121a1b22659747c7edaecf05d3cd39b2d92e))
* add release-please workflow ([5a89670](https://github.com/QuantGeekDev/mcp-framework/commit/5a89670a1f797f8d91254d0b3f9f991fdc77148a))
* add resources support ([e8b03d4](https://github.com/QuantGeekDev/mcp-framework/commit/e8b03d432fd09e7e25e3f272f735cebeb571a31b))
* add sdk version logging ([8a05c48](https://github.com/QuantGeekDev/mcp-framework/commit/8a05c48431ff01b4fd68e178a055cfec41236b21))
* add sdk version logging ([bb716db](https://github.com/QuantGeekDev/mcp-framework/commit/bb716dba19d75214f7f23973f526f4ab107fe187))
* add toolLoader ([a44ffe7](https://github.com/QuantGeekDev/mcp-framework/commit/a44ffe7e7df099479ff516bc5fa0e9e2a5115bf0))
* add typescript dependencies ([0ade3dc](https://github.com/QuantGeekDev/mcp-framework/commit/0ade3dc3627934884b8908202fe71b06a3a1c660))
* bump up version ([85624c6](https://github.com/QuantGeekDev/mcp-framework/commit/85624c6bfe7dda5df0cfb6894b58bf8a6b39a99e))
* bump version ([0d88a0f](https://github.com/QuantGeekDev/mcp-framework/commit/0d88a0fbd6b571ff578a96c85361930616371355))
* bump version ([e227702](https://github.com/QuantGeekDev/mcp-framework/commit/e227702c87476bda82384c34efd871b13292b089))
* bump version ([33b1776](https://github.com/QuantGeekDev/mcp-framework/commit/33b17764330126ee79bb4c9510d8f067b339fda3))
* bump version ([a0e5a38](https://github.com/QuantGeekDev/mcp-framework/commit/a0e5a381ecc4b9fc6dee3a35609ead7297af905a))
* bump version ([ea3085d](https://github.com/QuantGeekDev/mcp-framework/commit/ea3085d1deae39e8dc737be499564d6a9487654c))
* bump version ([ddf74f6](https://github.com/QuantGeekDev/mcp-framework/commit/ddf74f6f142a69dcfe99af8def8b785b59c6d662))
* bump version ([4c04edb](https://github.com/QuantGeekDev/mcp-framework/commit/4c04edbf0037f34041948bd9596a1d3cab4f4b34))
* bump version ([0e6a21b](https://github.com/QuantGeekDev/mcp-framework/commit/0e6a21bbfc90ed9166692e4aea02d4e7d07a93d4))
* bump version ([1d1cfef](https://github.com/QuantGeekDev/mcp-framework/commit/1d1cfef4542d95d66fb52b8bee61d0eb6766674a))
* bump version number ([3a7f329](https://github.com/QuantGeekDev/mcp-framework/commit/3a7f329092c810d99d0cedd09ba11d902e941879))
* enforce node version 20 ([8f1466a](https://github.com/QuantGeekDev/mcp-framework/commit/8f1466adfa7f6adc69070ed1d7feb7c8ffbca224))
* enforce node version 20 ([bf4a4bb](https://github.com/QuantGeekDev/mcp-framework/commit/bf4a4bb427bedd948509eaf13b8a82222c98c006))
* fix directory validation issue ([bf0e0d4](https://github.com/QuantGeekDev/mcp-framework/commit/bf0e0d4d331cf64a132b27c52b85d0115fe6f280))
* fix directory validation issue ([bc6ab31](https://github.com/QuantGeekDev/mcp-framework/commit/bc6ab31396a05c898121ccc96a545e4a1ebc82ea))
* HTTP stream transport implementation (v0.2.0-beta.16) ([d29fb5f](https://github.com/QuantGeekDev/mcp-framework/commit/d29fb5fc36ce67c4494a2a47e79645a2559c4f80))
* lower node version to 18 ([77c8d1b](https://github.com/QuantGeekDev/mcp-framework/commit/77c8d1bcb4b26dbc0d8884269d9b5ddfe9b8864c))
* make the mcp server config optional ([9538626](https://github.com/QuantGeekDev/mcp-framework/commit/9538626ff03a9534a72913436c011616b61163e2))
* make toolLoader load tools automatically ([16f2793](https://github.com/QuantGeekDev/mcp-framework/commit/16f27930bf4d5251867f5a700fa1842d8f70ad07))
* read default name and version from package json ([b5789af](https://github.com/QuantGeekDev/mcp-framework/commit/b5789af47c112eddece3764505e8e942dc6f3810))
* remove vibe coder contingency ([36bbc88](https://github.com/QuantGeekDev/mcp-framework/commit/36bbc88d731f6aa2629ad85da3ab69e77508b74f))
* update readme ([ac3725a](https://github.com/QuantGeekDev/mcp-framework/commit/ac3725a4fda0b0b14a9a5d3cea44674e191999dc))
* update readme ([06af3b8](https://github.com/QuantGeekDev/mcp-framework/commit/06af3b8573e41360f528b21176fceeb4290f1197))
* update readme ([e739ff6](https://github.com/QuantGeekDev/mcp-framework/commit/e739ff6d2570b134289c3190476af4fe7ca61d1c))
* update README ([6c1efcd](https://github.com/QuantGeekDev/mcp-framework/commit/6c1efcde6bcef838aaacc52e6e41903025e5ecc5))
* upgrade tool loader ([2b066e6](https://github.com/QuantGeekDev/mcp-framework/commit/2b066e6a0af46f9720ee266e019345fd6022eb3a))


### Bug Fixes

* add release-please manifest file ([14bd878](https://github.com/QuantGeekDev/mcp-framework/commit/14bd878652ea3fdbf684749cb42752bccf675a6b))
* build error ([adc7e48](https://github.com/QuantGeekDev/mcp-framework/commit/adc7e48d51b6075ab7624901033050e87ef1f632))
* build errors with mcp-build ([27c255b](https://github.com/QuantGeekDev/mcp-framework/commit/27c255b119dbcc79575b4feae589c980972c8933))
* build errors with mcp-build ([dc5b56e](https://github.com/QuantGeekDev/mcp-framework/commit/dc5b56e6b1bf7937b02eb29a7c33a6ca7b771eb6))
* build issues ([2a3d12d](https://github.com/QuantGeekDev/mcp-framework/commit/2a3d12d1d5c0bd238cdd090e0e805cd4625ade32))
* cli build issues ([f84266a](https://github.com/QuantGeekDev/mcp-framework/commit/f84266a29214e5de73bd52bc0135727882cadbef))
* execa ([641614d](https://github.com/QuantGeekDev/mcp-framework/commit/641614d3b86450fbc850ee22898003438f5504cc))
* execa ([e520f27](https://github.com/QuantGeekDev/mcp-framework/commit/e520f2718fb8c082bdd76431e1b63b9cd72a301e))
* follow spec ([b9420c4](https://github.com/QuantGeekDev/mcp-framework/commit/b9420c45fbb44d65b4cf430dc69ee96294d7ad43))
* follow spec ([938a13b](https://github.com/QuantGeekDev/mcp-framework/commit/938a13b4c7ae08f88a5ac4078dbac94b1f89f31d))
* node spawning issue ([8b5d4fa](https://github.com/QuantGeekDev/mcp-framework/commit/8b5d4fafac022c15028abbf62a11fdf2a35207df))
* Prevent duplicate builds by removing prepare script ([3584959](https://github.com/QuantGeekDev/mcp-framework/commit/3584959f6c3260c3299beeb6cc09c284f6206d84))
* remove findup ([f281451](https://github.com/QuantGeekDev/mcp-framework/commit/f281451cb25264fcd80bf90ac7027fd1bbeaa1f4))
* remove findup ([be6f5b0](https://github.com/QuantGeekDev/mcp-framework/commit/be6f5b076c0c764b4447a87eb0b75ee5cc607e42))
* remove project name ([40789f3](https://github.com/QuantGeekDev/mcp-framework/commit/40789f3760f04a0dc117b6866b439e283ceec68a))
* remove project name ([6e89e31](https://github.com/QuantGeekDev/mcp-framework/commit/6e89e3128cca93d2657fc2dc382fa0f0d658aaf6))
* remove redundant prepare script from package.json and create.ts ([1ddff3f](https://github.com/QuantGeekDev/mcp-framework/commit/1ddff3f5ce4f8d7817a9c04db6432332957635a9))
* scope ([84b72f6](https://github.com/QuantGeekDev/mcp-framework/commit/84b72f6f2988121277bffcb5eb0474a47c2940a1))
* session id for initialization ([2743eaf](https://github.com/QuantGeekDev/mcp-framework/commit/2743eaf68994e890d319e9b2881ea47bb676d848))
* session id for initialization ([061d152](https://github.com/QuantGeekDev/mcp-framework/commit/061d1522729392a49e8565569931d96ef7c57693))
* sse reconnect issues ([fad62e3](https://github.com/QuantGeekDev/mcp-framework/commit/fad62e33b9fc3cc0df5bdfd96370dd6c2723dc57))
* tool loader base dir ([636807c](https://github.com/QuantGeekDev/mcp-framework/commit/636807cea8eb93227a75725b7359828e24bc8d26))
* tool loader base dir ([aa035a0](https://github.com/QuantGeekDev/mcp-framework/commit/aa035a0cd3da7d2187b2aae8d08da382b0a8d1f2))
* tsc during project creation bug ([eb3a7bf](https://github.com/QuantGeekDev/mcp-framework/commit/eb3a7bf0f94ca9809cfede795425f30a31480664))
* tsc during project creation bug ([2177d3e](https://github.com/QuantGeekDev/mcp-framework/commit/2177d3ebfee001242fb7fa6ac989cee9e3c05a1b))
* tsconfig not found ([4d2062f](https://github.com/QuantGeekDev/mcp-framework/commit/4d2062fe5e8f1984b770cd5389d4c2c8f84c7cff))
* tsconfig not found ([ec87841](https://github.com/QuantGeekDev/mcp-framework/commit/ec87841580cf9d4ea1ab9e5e3765b68f01a483be))
* wrong index created ([b6f186c](https://github.com/QuantGeekDev/mcp-framework/commit/b6f186cc21f79bef0acadd6bf904277ef2f13760))
* wrong index created ([1c6f9ef](https://github.com/QuantGeekDev/mcp-framework/commit/1c6f9ef587f14d77e346df7dbf1b59ad5fb5a3bc))

## [Unreleased]
