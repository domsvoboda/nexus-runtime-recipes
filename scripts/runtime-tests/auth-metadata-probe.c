/* SPDX-License-Identifier: MIT
 * Actual production logger/init/retry bodies, synthetic transports only.
 * No account, network, identity database or real credential is accessed. */
#include <windows.h>
#include <objbase.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
#define ACCEPT_JSON NULL
typedef unsigned XUserAddOptions;
#define XUserAddOptions_AddDefaultUserAllowingUI 2
typedef struct XUser {
    char *deviceToken, *userToken, *titleToken;
    CRITICAL_SECTION deviceAuthSection;
    CONDITION_VARIABLE initCv;
    LONG initDone;
    HRESULT initResult;
    int IUser_iface;
    UINT64 xuid;
    char xbox_msa_id[17], store_msa_id[17];
} *XUserHandle;
typedef int IXThreadingImpl;
typedef int XAsyncBlock;
static LONG checks, failures;
#define CHECK(n,v) do { ++checks; if (!(v)) { ++failures; printf("FAIL %s line=%u\n", n, __LINE__); } } while (0)
static unsigned step, fail_step, transient, delays, signed_in, completed, released, calls;
static HRESULT completed_hr;
static char log_path[MAX_PATH];
static char output[32769];
static HRESULT stage(void)
{
    ++calls;
    if (++step == fail_step) return E_ACCESSDENIED;
    return S_OK;
}
static HRESULT http_request(const WCHAR *method, const WCHAR *url, const char *body, const WCHAR *auth,
                           const WCHAR *accept, BYTE **buffer, SIZE_T *size)
{
    HRESULT hr;
    CHECK("same GET requests", !wcscmp(method,L"GET") && !body && accept == ACCEPT_JSON);
    CHECK("same endpoint order", wcsstr(url,step ? L"/current/" : L"/default/") != NULL);
    CHECK("authorization only for current endpoints", step ? auth != NULL : auth == NULL);
    if (!step && transient) { --transient; ++calls; return E_ACCESSDENIED; }
    if (FAILED(hr = stage())) return hr;
    *buffer = calloc(1, 16); *size = 16;
    return *buffer ? S_OK : E_OUTOFMEMORY;
}
static HRESULT load_endpoints(XUserHandle user, BYTE *buffer, SIZE_T size)
{
    CHECK("parse inputs unchanged", user && buffer && size == 16);
    return stage();
}
static HRESULT get_rps_tickets(BOOLEAN ui, char **user, char **device, char xbox_id[17], char store_id[17])
{
    HRESULT hr;
    CHECK("UI option preserved", ui == XUserAddOptions_AddDefaultUserAllowingUI);
    if (FAILED(hr = stage())) return hr;
    *user = strdup("SYNTHETIC_USER_SECRET"); *device = strdup("SYNTHETIC_DEVICE_TICKET");
    strcpy(xbox_id, "0123456789abcdef"); strcpy(store_id, "fedcba9876543210");
    return S_OK;
}
static HRESULT device_auth(XUserHandle user, const char *ticket, char **token)
{
    HRESULT hr;
    CHECK("device ticket preserved", user && !strcmp(ticket,"SYNTHETIC_DEVICE_TICKET"));
    if (FAILED(hr = stage())) return hr;
    *token = strdup("SYNTHETIC_DEVICE_SECRET"); return S_OK;
}
static HRESULT sisu_auth(XUserHandle user, const char *ticket, const char *token, WCHAR **auth)
{
    HRESULT hr;
    CHECK("SISU inputs preserved", user && !strcmp(ticket,"SYNTHETIC_USER_SECRET") && !strcmp(token,"SYNTHETIC_DEVICE_SECRET"));
    if (FAILED(hr = stage())) return hr;
    user->xuid = 123;
    *auth = calloc(16,sizeof(WCHAR)); wcscpy(*auth,L"SECRET_AUTH"); return S_OK;
}
static HRESULT account_metadata_publish(UINT64 xuid, const char *xbox, const char *store)
{
    CHECK("metadata only after authentication", xuid == 123);
    CHECK("metadata preserves distinct principals", !strcmp(xbox,"0123456789abcdef") && !strcmp(store,"fedcba9876543210"));
    /* Failure of optional registry metadata must not fail sign-in. */
    return E_ACCESSDENIED;
}
static void set_signed_in_user(struct XUser *user) { CHECK("sign in only initialized user", user->initDone && SUCCEEDED(user->initResult)); ++signed_in; }
static void probe_sleep(DWORD ms) { CHECK("retry delay unchanged", ms == 3000); ++delays; step = 0; }
static void probe_release(void *iface) { CHECK("release initialized user", iface != NULL); ++released; }
static void probe_complete(void *threading, void *async, HRESULT hr, SIZE_T size)
{
    CHECK("completion objects preserved", threading && async);
    CHECK("result size matches status", size == (SUCCEEDED(hr) ? sizeof(XUserHandle) : 0));
    ++completed; completed_hr = hr;
}
#define Sleep probe_sleep
#define IUser_Release probe_release
#define IXThreadingImpl_Release probe_release
#define IXThreadingImpl_XAsyncComplete probe_complete
#include "auth-metadata-adapter.inc"
#undef Sleep
static void reset_log(void)
{
    HANDLE file=CreateFileA(log_path,GENERIC_WRITE,FILE_SHARE_READ,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
    CHECK("precreate private log", file != INVALID_HANDLE_VALUE);
    if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
}
static DWORD read_log(void)
{
    DWORD size=0;
    HANDLE file=CreateFileA(log_path,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    output[0]=0;
    CHECK("open private log", file != INVALID_HANDLE_VALUE);
    if (file == INVALID_HANDLE_VALUE) return 0;
    CHECK("read private log", ReadFile(file,output,sizeof(output)-1,&size,NULL)); CloseHandle(file); output[size]=0;
    CHECK("bounded to 32 KiB", size <= 32768);
    CHECK("no credential content", !strstr(output,"SECRET") && !strstr(output,"TICKET") && !strstr(output,"https:") && !strstr(output,"Authorization"));
    return size;
}
static DWORD WINAPI writer(void *arg)
{
    unsigned i; (void)arg;
    for(i=0;i<1000;++i) auth_metadata("xsts",NULL,E_ACCESSDENIED,401,FALSE,FALSE);
    return 0;
}
int main(void)
{
    struct XUser user = {0};
    char tmp[MAX_PATH],long_path[MAX_PATH+32];
    DWORD size, written;
    HANDLE file,threads[4];
    unsigned i,n;
    HRESULT hr;
    GetTempPathA(sizeof(tmp),tmp); GetTempFileNameA(tmp,"aut",0,log_path);
    DeleteFileA(log_path);
    SetEnvironmentVariableA("XUSER_AUTH_METADATA_LOG",NULL);
    SetLastError(1234); auth_metadata("xsts",NULL,E_FAIL,0,FALSE,FALSE);
    CHECK("disabled preserves last error", GetLastError() == 1234);
    SetEnvironmentVariableA("XUSER_AUTH_METADATA_LOG",log_path);
    auth_metadata("xsts",NULL,E_FAIL,0,FALSE,FALSE);
    CHECK("never creates log implicitly", GetFileAttributesA(log_path) == INVALID_FILE_ATTRIBUTES);
    reset_log();
    SetLastError(4567); auth_metadata("SECRET\nxsts",NULL,E_FAIL,0,FALSE,FALSE);
    CHECK("invalid phase preserves error", GetLastError() == 4567);
    auth_metadata(NULL,NULL,E_FAIL,0,FALSE,FALSE);
    CHECK("unknown phase cannot inject text", read_log() == 0);
    user.deviceToken="SECRET_DEVICE"; user.userToken="SECRET_USER"; user.titleToken="SECRET_TITLE";
    SetLastError(7890); auth_metadata("xsts",&user,E_ACCESSDENIED,403,TRUE,FALSE);
    CHECK("enabled preserves last error", GetLastError() == 7890);
    read_log();
    CHECK("numeric status and flags only", strstr(output,"phase=xsts hr=80070005 http=403 device=1 user=1 title=1 requested_title=1 actual_title=0 tick="));
    reset_log();
    memset(long_path,'x',sizeof(long_path)-1); long_path[sizeof(long_path)-1]=0;
    SetEnvironmentVariableA("XUSER_AUTH_METADATA_LOG",long_path); auth_metadata("xsts",NULL,S_OK,200,TRUE,TRUE);
    SetEnvironmentVariableA("XUSER_AUTH_METADATA_LOG",log_path);
    CHECK("oversized path ignored", read_log() == 0);
    file=CreateFileA(log_path,GENERIC_READ,0,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    CHECK("hold log exclusively",file!=INVALID_HANDLE_VALUE);
    SetLastError(3456); auth_metadata("xsts",NULL,E_FAIL,0,FALSE,FALSE);
    CHECK("busy log preserves caller error",GetLastError()==3456);
    CloseHandle(file); CHECK("busy log skips writing",read_log()==0);
    for(i=0;i<4;++i) { threads[i]=CreateThread(NULL,0,writer,NULL,0,NULL); CHECK("writer created", threads[i]!=NULL); }
    CHECK("concurrent writers finish", WaitForMultipleObjects(4,threads,TRUE,10000)==WAIT_OBJECT_0);
    for(i=0;i<4;++i) CloseHandle(threads[i]);
    size=read_log(); CHECK("concurrent bounded complete lines",size && size <= 32768 && output[size-1]=='\n');
    for(n=0,i=0;i<size;++i)if(output[i]=='\n')++n;
    CHECK("concurrent records present", n > 100);
    {
        char *line=strtok(output,"\n");
        while(line) {
            unsigned long tick,thread;
            int end=0;
            CHECK("concurrent record not interleaved",sscanf(line,"AUTH_META phase=xsts hr=80070005 http=401 device=0 user=0 title=0 requested_title=0 actual_title=0 tick=%lu thread=%lu%n",&tick,&thread,&end)==2 && end>0 && !line[end]);
            line=strtok(NULL,"\n");
        }
    }
    /* Exact-capacity file must never be truncated, wrapped or appended. */
    reset_log(); file=CreateFileA(log_path,GENERIC_WRITE,0,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    memset(output,'X',32768); WriteFile(file,output,32768,&written,NULL); CloseHandle(file);
    auth_metadata("xsts",NULL,S_OK,200,TRUE,TRUE);
    CHECK("full file untouched", read_log()==32768 && output[0]=='X' && output[32767]=='X');
    InitializeCriticalSection(&user.deviceAuthSection); InitializeConditionVariable(&user.initCv);
    user.userToken=NULL; user.titleToken=NULL; user.deviceToken=NULL;
    for(i=0;i<2;++i) {
        reset_log(); step=fail_step=calls=0;
        /* Neither a disabled logger nor an unavailable file may affect auth. */
        SetEnvironmentVariableA("XUSER_AUTH_METADATA_LOG",i ? log_path : NULL);
        if(i) DeleteFileA(log_path);
        CHECK("auth unaffected when diagnostics unavailable",user_initialize_network(&user,XUserAddOptions_AddDefaultUserAllowingUI)==S_OK && calls==7);
        free(user.deviceToken); user.deviceToken=NULL;
    }
    SetEnvironmentVariableA("XUSER_AUTH_METADATA_LOG",log_path);
    for(i=0;i<=7;++i) {
        reset_log(); step=0; fail_step=i; calls=0;
        hr=user_initialize_network(&user,XUserAddOptions_AddDefaultUserAllowingUI);
        CHECK("real initialization status preserved",hr==(i ? E_ACCESSDENIED : S_OK));
        CHECK("no calls past failed stage",calls==(i ? i : 7));
        read_log(); CHECK("default stage recorded",strstr(output,"init-default-begin") && strstr(output,"init-default-end"));
        if(!i) {
            static const char *const phases[]={"init-default-begin","init-default-end","init-default-parse","init-tickets-begin","init-tickets-end","init-device-begin","init-device-end","init-sisu-begin","init-sisu-end","init-current-begin","init-current-end","init-current-parse"};
            char *cursor=output;
            for(n=0;n<ARRAY_SIZE(phases);++n) {
                char *next=strstr(cursor,phases[n]);
                CHECK("authentication phase order",next!=NULL);
                if(!next) break;
                cursor=next+strlen(phases[n]);
            }
        }
        free(user.deviceToken); user.deviceToken=NULL;
    }
    for(i=0;i<2;++i) {
        struct user_network_init *init=calloc(1,sizeof(*init));
        reset_log(); step=fail_step=delays=signed_in=completed=released=calls=0;
        transient=i ? 10 : 2; user.initDone=0; user.initResult=E_PENDING;
        init->user=&user; init->options=XUserAddOptions_AddDefaultUserAllowingUI;
        init->threading=(void *)1; init->async=(void *)2;
        CHECK("production worker returns",user_network_init_thread(init)==0);
        CHECK("completion only once",completed==1 && released==2);
        CHECK("worker publishes actual status",user.initDone && user.initResult==completed_hr);
        CHECK("bounded retry preserved",delays==(i ? 4 : 2));
        CHECK("no fake sign in after failure",signed_in==(i ? 0 : 1));
        read_log(); CHECK("worker diagnostic phases",strstr(output,"init-worker-begin") && strstr(output,"init-attempt-end") && strstr(output,"init-retry") && strstr(output,"init-complete"));
        free(user.deviceToken); user.deviceToken=NULL;
    }
    DeleteCriticalSection(&user.deviceAuthSection);
    SetEnvironmentVariableA("XUSER_AUTH_METADATA_LOG",NULL); DeleteFileA(log_path);
    printf("CHECKS %ld FAILURES %ld\n",checks,failures);
    return failures ? 1 : 0;
}
