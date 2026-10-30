cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.0.3"
  sha256 arm:   "81b52750e28b441825740c0cb92e2391c85275ae3b6de901b78836beca4f7ef5",
         intel: "d9345355acadbb704636320b33e33fae2ae5f941e0a96f13195483834ab18fc5"

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
