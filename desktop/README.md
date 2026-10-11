# ��Ծ���� Windows ���������

�����ˣ�١ѩӣ�����������װ���밴�ֿ� LICENSE ����ҵ���������ṩ��Electron��Chromium��Node ��ԭ�� AI �����������ɡ�

���ط���ҳ�� `Starhop-Club-2.2.0-Windows-x64.exe` ��˫�����С����谲װ Node��������� npm������ AI Ȩ�����ã�����ʱ��ѹ����ʱĿ¼���״δ���Ҫ�Եȡ�Windows 10/11 x64������Ԥ�� 1 GB ���пռ䡣��������������Ҫ���õ� OpenCL �Կ�������

- �������ڣ�F11 ȫ����Esc �˳�ȫ�����رմ��ڻ�ֹͣ�� AI ��̨��
- �浵����۱����� `%APPDATA%\StarhopClub-Desktop`���ƶ� EXE ��Ӱ��浵��
- ��������ǰ��������Ƕ����浵�ռ䣻����ʹ�����׵���/����Ǩ�ơ�
- ������������� `127.0.0.1:52730`�������ž��������ظ��򿪻�۽����д��ڡ�
- ��δ���� Windows ����ǩ����ϵͳ������ʾδ֪�����ߡ���˶� GitHub ����ҳ�� SHA-256 У���ļ���

## ����

��Ҫ Node.js��Python 3.9+ �� Pillow��������ҳ����֤�� `Starhop-Club-2.2.0-Windows-x64.zip` �ŵ� `release-package/2.2.0/`��׼���ű��˶Թ̶� SHA-256�����޸����� AI��

```powershell
python -m pip install Pillow
python desktop/prepare.py
cd desktop
npm ci
npm run dist
```

����� `release-package/2.2.0/desktop-build/`��Electron �����ļ�Я�� LICENSE.electron.txt �� LICENSES.chromium.html����Ϸ�ڵĵ�����˵���� vendor Ŀ¼���غɱ�����

�Զ�����ð�̲���ʹ�ø������ã���������Ҵ浵������ `STARHOP_SMOKE_OUTPUT`��JSON ����·������ `STARHOP_SMOKE_SCREENSHOT`��PNG ����·�������� `--starhop-smoke` ���� EXE�����������ڡ�������ˮӡ���洢���ء�ȫ����ԭ�� AI �������Զ��˳���
