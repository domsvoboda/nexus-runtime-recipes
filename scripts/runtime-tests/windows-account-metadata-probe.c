/* SPDX-License-Identifier: MIT
 * Synthetic identities and own fresh prefix only, never authentication. */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
static LONG checks, failures, writes, fail_write;
#define CHECK(n,v) do { InterlockedIncrement(&checks); if (!(v)) { if (InterlockedIncrement(&failures)<=20) printf("FAIL %s line=%u\n",n,__LINE__); } } while(0)
static LSTATUS probe_write(HKEY k,const char *n,DWORD r,DWORD t,const BYTE *v,DWORD s)
{ if (InterlockedIncrement(&writes)==fail_write)return ERROR_ACCESS_DENIED;return RegSetValueExA(k,n,r,t,v,s); }
#define RegSetValueExA probe_write
#include "windows-account-metadata.h"
#undef RegSetValueExA
static const char first[]="0123456789abcdef",second[]="fedcba9876543210";
static BOOL absent(const char *key,const char *value)
{ char b[32];DWORD size=sizeof(b);return RegGetValueA(HKEY_CURRENT_USER,key,value,RRF_RT_REG_SZ,NULL,b,&size)==ERROR_FILE_NOT_FOUND; }
static BOOL value_is(const char *key,const char *name,const char *expected)
{ char b[32];DWORD size=sizeof(b);return RegGetValueA(HKEY_CURRENT_USER,key,name,RRF_RT_REG_SZ,NULL,b,&size)==ERROR_SUCCESS&&!strcmp(b,expected); }
static void reset(void)
{ RegDeleteTreeA(HKEY_CURRENT_USER,account_metadata_marker);RegDeleteTreeA(HKEY_CURRENT_USER,account_metadata_xbox);RegDeleteTreeA(HKEY_CURRENT_USER,account_metadata_store);writes=fail_write=0; }
static DWORD WINAPI worker(void *context)
{ unsigned i; (void)context;for(i=0;i<100;i++){CHECK("same-account concurrent publisher",account_metadata_publish(1234567890123456ULL,first,first)==S_OK);CHECK("same-account Xuid never removed",value_is(account_metadata_xbox,"Xuid","1234567890123456"));}return 0; }
static void child(const char *mode)
{ WCHAR exe[MAX_PATH],command[MAX_PATH+64];STARTUPINFOW startup={0};PROCESS_INFORMATION p={0};DWORD code;
 startup.cb=sizeof(startup);GetModuleFileNameW(NULL,exe,MAX_PATH);swprintf(command,ARRAY_SIZE(command),L"\"%ls\" --child-%hs",exe,mode);
 CHECK("child starts",CreateProcessW(NULL,command,NULL,NULL,FALSE,0,NULL,NULL,&startup,&p));
 if(!p.hProcess)return;
 CHECK("child finishes",WaitForSingleObject(p.hProcess,15000)==WAIT_OBJECT_0);GetExitCodeProcess(p.hProcess,&code);CHECK("child result",code==0);CloseHandle(p.hProcess);CloseHandle(p.hThread); }

/* Execute the production ticket handling with a synthetic XML tree/transport.
 * This checks optional-field behavior, not the libxml parser itself. */
#define TRACE(...) do {} while(0)
#define ERR(...) do {} while(0)
#define BAD_CAST (xmlChar *)
#define XML_ELEMENT_NODE 1
#define XODUS_MSA_TOKEN_REQUEST 1
#define E_GAME_MISSING_GAME_CONFIG ((HRESULT)0x89245100)
typedef unsigned char xmlChar;
typedef struct node { const xmlChar *name; int type; struct node *children,*next; const char *value; } *xmlNodePtr;
typedef void *xmlDocPtr;
static char *msaAppId="synthetic-client";
static BOOL fullTrust;
static HRESULT transport_result;
static BOOL bad_xml;
static struct node nodes[5];
static xmlDocPtr xmlNewDoc(const xmlChar *v) { (void)v;return nodes; }
static xmlNodePtr xmlNewNode(void *ns,const xmlChar *n) { (void)ns;(void)n;return nodes; }
static void xmlDocSetRootElement(xmlDocPtr d,xmlNodePtr n) { (void)d;(void)n; }
static void xmlNewTextChild(xmlNodePtr r,void *ns,const xmlChar *n,const xmlChar *v) { (void)r;(void)ns;CHECK("ticket request has unchanged fields",n&&v); }
static void xmlDocDumpMemory(xmlDocPtr d,xmlChar **body,int *size) { (void)d;*body=(xmlChar *)strdup("fixture-request");*size=15; }
static void xmlFreeDoc(xmlDocPtr d) { (void)d; }
#define xmlFree free
static xmlDocPtr xmlReadMemory(const char *r,int size,const char *a,const char *b,int flags) { (void)r;(void)size;(void)a;(void)b;(void)flags;return bad_xml?NULL:nodes; }
static xmlNodePtr xmlDocGetRootElement(xmlDocPtr d) { return d; }
static xmlChar *xmlNodeGetContent(xmlNodePtr n) { return n->value?(xmlChar *)strdup(n->value):NULL; }
static HRESULT xodus_request(int type,const char *body,int size,char **response,UINT16 *length)
{ CHECK("same ticket transport",type==1&&body&&size==15);*response=NULL;*length=0;if(FAILED(transport_result))return transport_result;*response=strdup("fixture-response");*length=16;return S_OK; }
#include "windows-account-ticket-adapter.inc"
static void ticket_cases(void)
{
 unsigned i;char *user=NULL,*device=NULL,a[17],b[17];HRESULT hr;
 const char *names[]={"Token","DeviceRps","XboxMsaAccountId","StoreMsaAccountId"};
 nodes[0].children=nodes+1;
 for(i=1;i<5;i++){nodes[i].name=(const xmlChar *)names[i-1];nodes[i].type=XML_ELEMENT_NODE;nodes[i].next=i<4?nodes+i+1:NULL;}
 nodes[1].value="synthetic-user-ticket";nodes[2].value="synthetic-device-ticket";
 for(i=0;i<5;i++){
  nodes[3].value=i==0?NULL:i==1?"invalid":"0123456789ABCDEF";
  nodes[4].value=i==0?NULL:i==2?NULL:i==4?"fedcba9876543210":"0123456789abcdef";
  hr=get_rps_tickets(TRUE,&user,&device,a,b);
  CHECK("legacy and optional malformed metadata never fails valid tickets",hr==S_OK&&user&&device&&!strcmp(user,"synthetic-user-ticket")&&!strcmp(device,"synthetic-device-ticket"));
  CHECK("optional pair all-or-none",i<3?(!a[0]&&!b[0]):(!strcmp(a,"0123456789abcdef")&&!strcmp(b,i==4?"fedcba9876543210":"0123456789abcdef")));
  free(user);free(device);user=device=NULL;
 }
 nodes[1].value="";CHECK("incomplete credentials remain refused",get_rps_tickets(FALSE,&user,&device,a,b)==E_UNEXPECTED&&!user&&!device);nodes[1].value="synthetic-user-ticket";
 transport_result=E_ACCESSDENIED;CHECK("transport auth failure preserved",get_rps_tickets(FALSE,&user,&device,a,b)==E_ACCESSDENIED);transport_result=S_OK;
 bad_xml=TRUE;CHECK("malformed XML auth failure preserved",get_rps_tickets(FALSE,&user,&device,a,b)==E_UNEXPECTED);bad_xml=FALSE;
 msaAppId=NULL;fullTrust=TRUE;CHECK("missing full-trust game config still refused",get_rps_tickets(FALSE,&user,&device,a,b)==E_GAME_MISSING_GAME_CONFIG);fullTrust=FALSE;
 CHECK("platform fallback still authenticates",get_rps_tickets(FALSE,&user,&device,a,b)==S_OK);free(user);free(device);
}

int main(int argc,char **argv)
{
 HKEY key;DWORD disposition,i;char a[17],b[17];HANDLE threads[8];BOOL empty;
 if(argc==2&&strstr(argv[1],"--child-")==argv[1]){
  HRESULT hr=account_metadata_publish(strstr(argv[1],"different")?2234567890123456ULL:1234567890123456ULL,first,first);
  return hr==(strstr(argv[1],"different")?S_FALSE:S_OK)?0:1;
 }
 empty=absent(account_metadata_xbox,"Xuid")&&absent(account_metadata_store,"PrimaryWebAccountId");
 CHECK("fresh disposable prefix",empty);if(!empty)return 2;
 if(argc==2&&!strcmp(argv[1],"--empty-only"))goto finished;
 if(argc==2&&!strcmp(argv[1],"--leave-volatile")){CHECK("volatile publication",account_metadata_publish(1234567890123456ULL,first,first)==S_OK);goto finished;}
 ticket_cases();
 for(i=0;i<6;i++){
  const char *bad[]={"","short","0000000000000000","0123456789abcdeg","0123456789abcdef0","0123456789abcde\n"};
  CHECK("malformed identity rejected",account_metadata_publish(123,bad[i],first)==S_FALSE);
  CHECK("invalid metadata never creates identity",absent(account_metadata_xbox,"Xuid"));
 }
 CHECK("pair canonicalization",account_metadata_pair("0123456789ABCDEF",second,a,b)&&!strcmp(a,first)&&!strcmp(b,second));
 CHECK("pair preserves actual mismatch",strcmp(a,b)!=0);
 CHECK("partial pair omitted",!account_metadata_pair(first,NULL,a,b)&&!a[0]&&!b[0]);
 CHECK("zero Xbox identity rejected",account_metadata_publish(0,first,first)==S_FALSE);
 CHECK("publication from supplied identities",account_metadata_publish(1234567890123456ULL,first,first)==S_OK);
 CHECK("actual supplied Xbox id",value_is(account_metadata_xbox,"Xuid","1234567890123456"));
 CHECK("actual supplied MSA id",value_is(account_metadata_xbox,"AccountId",first));
 CHECK("actual supplied Store id",value_is(account_metadata_store,"PrimaryWebAccountId",first));
 child("same");child("different");CHECK("live foreign account cannot replace metadata",value_is(account_metadata_xbox,"Xuid","1234567890123456"));
 for(i=0;i<8;i++)threads[i]=CreateThread(NULL,0,worker,NULL,0,NULL);
 CHECK("publishers join",WaitForMultipleObjects(8,threads,TRUE,30000)==WAIT_OBJECT_0);for(i=0;i<8;i++)CloseHandle(threads[i]);
 CHECK("active account switch refused",account_metadata_publish(2234567890123456ULL,second,second)==S_FALSE);
 reset();child("same");CHECK("dead producer replaced for actual next account",account_metadata_publish(2234567890123456ULL,second,second)==S_OK);
 CHECK("new account Xuid",value_is(account_metadata_xbox,"Xuid","2234567890123456"));CHECK("new account MSA",value_is(account_metadata_store,"PrimaryWebAccountId",second));
 reset();CHECK("actual mismatch still published honestly",account_metadata_publish(1234567890123456ULL,first,second)==S_OK);
 CHECK("Store mismatch is not forced equal",value_is(account_metadata_xbox,"AccountId",first)&&value_is(account_metadata_store,"PrimaryWebAccountId",second));
 CHECK("open own key",RegOpenKeyExA(HKEY_CURRENT_USER,account_metadata_xbox,0,KEY_WRITE,&key)==ERROR_SUCCESS);
 CHECK("synthetic manual change",RegSetValueExA(key,"AccountId",0,REG_SZ,(BYTE*)"manual",7)==ERROR_SUCCESS);RegCloseKey(key);
 CHECK("manual change not overwritten",account_metadata_publish(1234567890123456ULL,first,second)==S_FALSE&&value_is(account_metadata_xbox,"AccountId","manual"));
 reset();CHECK("foreign key fixture",RegCreateKeyExA(HKEY_CURRENT_USER,account_metadata_xbox,0,NULL,0,KEY_WRITE,NULL,&key,&disposition)==ERROR_SUCCESS);
 CHECK("foreign value fixture",RegSetValueExA(key,"Xuid",0,REG_SZ,(BYTE*)"foreign",8)==ERROR_SUCCESS);RegCloseKey(key);
 CHECK("unmanaged keys preserved",account_metadata_publish(1234567890123456ULL,first,first)==S_FALSE&&value_is(account_metadata_xbox,"Xuid","foreign"));
 for(i=1;i<=7;i++){reset();fail_write=i;CHECK("fault does not publish incomplete Xuid",account_metadata_publish(1234567890123456ULL,first,first)==S_FALSE&&absent(account_metadata_xbox,"Xuid"));}
 reset();SetLastError(0x12345678);CHECK("publish succeeds",account_metadata_publish(1234567890123456ULL,first,first)==S_OK);CHECK("LastError preserved",GetLastError()==0x12345678);reset();
finished:
 printf("CHECKS %ld FAILURES %ld\n",checks,failures);return failures?1:0;
}
