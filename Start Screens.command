#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use --silent 22 || exit 1
fi
npm run screens:demo
