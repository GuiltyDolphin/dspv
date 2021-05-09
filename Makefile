setup_emacs_dev :
	@npm init -y
	@npm install --save-dev typescript-deno-plugin typescript

test :
	@NO_COLOR=1 deno test
