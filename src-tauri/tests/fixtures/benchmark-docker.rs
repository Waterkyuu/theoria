use std::io::Write;

fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().is_some_and(|argument| argument == "wait") {
        std::fs::write(&arguments[1], "ready").expect("ready marker");
        std::thread::sleep(std::time::Duration::from_secs(60));
        return;
    }
    let audit = std::env::current_exe()
        .expect("fixture executable")
        .with_extension("audit");
    let mut output = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(audit)
        .expect("fixture audit");
    writeln!(output, "{}", arguments.join("\n")).expect("audit command");
    if arguments
        .iter()
        .any(|argument| argument.contains("invalid.py"))
    {
        std::process::exit(2);
    }
    if arguments
        .iter()
        .any(|argument| argument.contains("runpy.run_path"))
    {
        println!(
            r#"{{"passed":true,"checks":[{{"passed":true,"message":"engine_report","path":null}}]}}"#
        );
    }
}
