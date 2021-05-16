setup_emacs_dev :
	@npm init -y
	@npm install --save-dev typescript-deno-plugin typescript

test :
	@NO_COLOR=1 deno test

COVERAGE_FILE=cov_profile
COVERAGE_OUT=coverage_report

coverage :
	@rm -rf $(COVERAGE_OUT)\
	&& NO_COLOR=1 deno test --coverage=$(COVERAGE_FILE) --unstable\
	&& deno coverage --unstable --lcov $(COVERAGE_FILE) > $(COVERAGE_FILE).lcov\
	&& mkdir -p $(COVERAGE_OUT)\
	&& genhtml $(COVERAGE_FILE).lcov --output-directory $(COVERAGE_OUT);\
	rm -rf $(COVERAGE_FILE){,.lcov};\
	echo -e "\n\nCoverage data stored in $(COVERAGE_OUT)"
