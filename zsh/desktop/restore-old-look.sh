gsettings set org.cinnamon.desktop.interface gtk-theme 'Mint-Y-Dark-Aqua'
gsettings set org.cinnamon.desktop.interface icon-theme 'Mint-Y-Sand'
gsettings set org.cinnamon.desktop.interface cursor-theme 'Bibata-Modern-Classic'
gsettings set org.cinnamon.desktop.interface font-name 'Ubuntu 10'
gsettings set org.cinnamon.theme name 'Mint-Y-Dark-Aqua'
gsettings set org.cinnamon.desktop.wm.preferences theme 'Mint-Y'
gsettings set org.cinnamon.desktop.background picture-uri 'file:///media/aiyu/U_U/Project%20Linux/F/Wallpaper/Wallpaper%20final.png'
gsettings set org.cinnamon panels-height ['1:25']
gsettings set org.cinnamon.desktop.wm.preferences titlebar-font 'Ubuntu Medium 10'
gsettings set org.cinnamon.desktop.wm.preferences button-layout ':minimize,maximize,close'
gsettings set org.cinnamon enabled-applets "['panel1:left:0:menu@cinnamon.org:0', 'panel1:left:1:separator@cinnamon.org:1', 'panel1:left:2:grouped-window-list@cinnamon.org:2', 'panel1:right:1:systray@cinnamon.org:3', 'panel1:right:3:notifications@cinnamon.org:5', 'panel1:right:4:printers@cinnamon.org:6', 'panel1:right:5:removable-drives@cinnamon.org:7', 'panel1:right:6:keyboard@cinnamon.org:8', 'panel1:right:7:favorites@cinnamon.org:9', 'panel1:right:8:network@cinnamon.org:10', 'panel1:right:9:sound@cinnamon.org:11', 'panel1:right:10:power@cinnamon.org:12', 'panel1:right:11:calendar@cinnamon.org:13', 'panel1:right:12:cornerbar@cinnamon.org:14', 'panel1:right:0:xapp-status@cinnamon.org:15']"
python3 - <<'PY'
import json,os
p=os.path.expanduser("~/.config/cinnamon/spices/calendar@cinnamon.org/13.json")
if os.path.exists(p):
    d=json.load(open(p)); d['custom-format']['value']='%I:%M %p'; json.dump(d,open(p,'w'),indent=4)
PY
