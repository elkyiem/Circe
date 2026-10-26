cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.0.0"
  sha256 arm:   "981da1c6cb6f494f5befa3daa7e7d4ee967730d089d5c9821a929bb026a0de77",
         intel: "550f877689472d3041a14cc45e46dc366fb7e71d8b38216a0dbf9b707809e254"

  url "https://github.com/raphaelsalaja/pond/releases/download/v#{version}/Pond-#{version}-#{arch}.dmg"
  name "Pond"
  desc "Local-first archive for things you save from the web"
  homepage "https://github.com/raphaelsalaja/pond"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :ventura

  app "Pond.app"

  zap trash: [
    "~/Library/Application Support/pond",
    "~/Library/Logs/pond",
    "~/Library/Preferences/so.pond.desktop.plist",
  ]
end
