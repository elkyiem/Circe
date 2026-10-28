cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.0.1"
  sha256 arm:   "9813b74675d33bb5eb8b8af9ed196e5cc72a5c4478457ff7e9b40956ccc4668e",
         intel: "671aac1d45a52af4b06209e0ad09e8d8ed257ffd6658525f71c271d762e4197b"

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
