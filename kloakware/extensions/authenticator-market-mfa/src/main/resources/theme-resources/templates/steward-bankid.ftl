<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
  <#if section = "header">
    ${msg("stewardBankIdTitle")}
  <#elseif section = "form">
    <form id="kc-bankid-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
      <div class="${properties.kcFormGroupClass!}">
        <p id="kc-bankid-instruction">${msg("stewardBankIdInstruction")}</p>
        <#if hintCode?has_content>
          <p id="kc-bankid-hint" class="${properties.kcLabelClass!}">${msg("stewardBankIdHint", hintCode)}</p>
        </#if>
      </div>
      <div id="kc-form-buttons" class="${properties.kcFormGroupClass!}">
        <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
               name="continue" id="kc-bankid-continue" type="submit" value="${msg("stewardBankIdContinue")}"/>
      </div>
    </form>
  </#if>
</@layout.registrationLayout>
