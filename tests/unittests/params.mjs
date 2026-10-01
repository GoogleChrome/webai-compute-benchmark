import { Params, defaultParams } from "../../resources/shared/params.mjs";
import { BenchmarkConfigurator } from "../../resources/benchmark-configurator.mjs";

describe("Params", () => {
    describe("toSearchParams", () => {
        it("should be empty for defaultParams", () => {
            expect(defaultParams.toSearchParams()).to.equal("");
        });
        it("should be empty for empty Params", () => {
            const params = new Params();
            expect(params.tags).to.eql(["default"]);
            expect(params.toSearchParams()).to.equal("");
        });
        it("should contain custom viewport", () => {
            const params = new Params(
                new URLSearchParams({
                    viewport: "100x200",
                })
            );
            expect(params.toSearchParams()).to.equal("viewport=100x200");
        });
        it("should not contain default viewport", () => {
            const params = new Params(
                new URLSearchParams({
                    viewport: "800x600",
                })
            );
            expect(params.toSearchParams()).to.equal("");
        });
        it("should contain custom iterationCount", () => {
            const params = new Params(
                new URLSearchParams({
                    iterationCount: "100",
                })
            );
            expect(params.toSearchParams()).to.equal("iterationCount=100");
        });
        it("should contain single suite", () => {
            const params = new Params(
                new URLSearchParams({
                    suites: "Suite1",
                })
            );
            expect(params.toSearchParams()).to.equal("suites=Suite1");
        });
        it("should ignore a single default tag", () => {
            const params = new Params(
                new URLSearchParams({
                    tags: ["default"],
                })
            );
            expect(params.toSearchParams()).to.equal("");
        });
        it("should contain multiple single suite", () => {
            const params = new Params(
                new URLSearchParams({
                    suites: "SuiteB,Suite1,SuiteA",
                })
            );
            expect(params.toSearchParams()).to.equal("suites=SuiteB%2CSuite1%2CSuiteA");
        });
        it("should contain multiple tags", () => {
            const params = new Params(
                new URLSearchParams({
                    tags: "tagB,tag1,tagA",
                })
            );
            expect(params.toSearchParams()).to.equal("tags=tagB%2Ctag1%2CtagA");
        });
        it("should support no suites", () => {
            const params = new Params(
                new URLSearchParams({
                    suites: "",
                })
            );
            expect(params.toSearchParams()).to.equal("suites=");
        });
    });

    describe("parse input params", () => {
        it("should parse custom viewport", () => {
            const params = new Params(
                new URLSearchParams({
                    viewport: "100x300",
                })
            );
            expect(params.viewport).to.eql({ width: 100, height: 300 });
        });
        it("should parse custom iterationCount", () => {
            const params = new Params(
                new URLSearchParams({
                    iterationCount: "100",
                })
            );
            expect(params.iterationCount).to.equal(100);
        });
        it("should parse custom tags", () => {
            const params = new Params(
                new URLSearchParams({
                    tags: "tagB,tag1,tagA",
                })
            );
            expect(params.tags).to.eql(["tagB", "tag1", "tagA"]);
        });
        it("should parse custom suites", () => {
            const params = new Params(
                new URLSearchParams({
                    suites: "SuiteB,Suite1,SuiteA",
                })
            );
            expect(params.suites).to.eql(["SuiteB", "Suite1", "SuiteA"]);
        });
        it("should parse valid http/https and relative config URLs", () => {
            const httpParams = new Params(
                new URLSearchParams({
                    config: "http://localhost:8080/resources/config.json",
                })
            );
            expect(httpParams.config).to.equal("http://localhost:8080/resources/config.json");

            const relativeParams = new Params(
                new URLSearchParams({
                    config: "resources/config.json",
                })
            );
            expect(relativeParams.config).to.equal("resources/config.json");
        });
        it("should reject non-http/https config URLs", () => {
            expect(() => {
                new Params(
                    new URLSearchParams({
                        config: "javascript:alert(1)//",
                    })
                );
            }).to.throwError();

            expect(() => {
                new Params(
                    new URLSearchParams({
                        config: "data:application/json,{}",
                    })
                );
            }).to.throwError();
        });
    });

    describe("BenchmarkConfigurator._isValidUrl", () => {
        const configurator = new BenchmarkConfigurator();

        it("should accept http, https, and relative URLs", () => {
            expect(configurator._isValidUrl("http://example.com/suite.html")).to.be(true);
            expect(configurator._isValidUrl("https://example.com/suite.html")).to.be(true);
            expect(configurator._isValidUrl("resources/transformers-js/dist/feature-extraction-cpu.html")).to.be(true);
        });

        it("should reject javascript:, data:, and empty URLs", () => {
            expect(configurator._isValidUrl("javascript:alert(1)//")).to.be(false);
            expect(configurator._isValidUrl("JaVaScRiPt:alert(1)//")).to.be(false);
            expect(configurator._isValidUrl("  javascript:alert(1)//")).to.be(false);
            expect(configurator._isValidUrl("data:text/html,<script>alert(1)</script>")).to.be(false);
            expect(configurator._isValidUrl("")).to.be(false);
        });
    });
});
