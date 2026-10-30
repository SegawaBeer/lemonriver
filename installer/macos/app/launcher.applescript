on run
	set appPath to POSIX path of (path to me)
	set scriptPath to appPath & "Contents/Resources/start.sh"
	set shellScript to "/bin/bash " & quoted form of scriptPath

	try
		set serviceState to do shell script shellScript & " status"
	on error
		set serviceState to "stopped"
	end try

	if serviceState is "running" then
		set choice to button returned of (display dialog "LemonRiver 服务正在运行。" buttons {"停止服务", "打开页面", "取消"} default button "打开页面" cancel button "取消" with title "LemonRiver")
		if choice is "停止服务" then
			try
				do shell script shellScript & " stop"
			end try
			display notification "服务已停止。" with title "LemonRiver"
		else
			open location (do shell script shellScript & " url")
		end if
		return
	end if

	try
		do shell script shellScript & " ensure"
	on error errText number errNum
		if errNum is not 78 then
			display dialog "LemonRiver 启动失败：" & errText buttons {"好"} default button "好" with title "LemonRiver"
		end if
		return
	end try

	set serviceUrl to do shell script shellScript & " url"

	repeat 60 times
		delay 0.5
		try
			do shell script "/usr/bin/curl -fsS -o /dev/null " & quoted form of serviceUrl
			open location serviceUrl
			display notification "服务已启动。" with title "LemonRiver"
			return
		end try
	end repeat

	set logDir to do shell script shellScript & " logs"
	set choice to button returned of (display dialog "服务 30 秒内没有启动成功。可以打开日志查看原因。" buttons {"取消", "打开日志"} default button "打开日志" cancel button "取消" with title "LemonRiver")
	if choice is "打开日志" then
		do shell script "/usr/bin/open " & quoted form of logDir
	end if
end run
