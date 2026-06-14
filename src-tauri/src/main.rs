// 防止在 Windows release 时出现额外的控制台窗口，勿删除！！
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    codeman_agent_lib::run()
}
