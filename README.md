# Oferta Direta

Página local para pesquisar um produto no Mercado Livre, na Shopee e na Amazon, reunir as melhores ofertas e enviar um resumo ao WhatsApp informado.

## O que já funciona

- consulta simultânea das três lojas, com até 10 ofertas de cada uma;
- modo alternativo por link ou ID do Mercado Livre: identifica o produto do catálogo e procura anúncios relacionados;
- seleção e ordenação das ofertas;
- links diretos para os produtos;
- link de afiliado da Shopee retornado pela própria Affiliate API;
- link de afiliado da Amazon retornado pela Creators API com o seu Partner Tag;
- envio automático pela WhatsApp Cloud API;
- modo alternativo: se a Cloud API não estiver configurada, abre o WhatsApp com a mensagem pronta;
- o telefone pesquisado não é salvo.

## Antes de iniciar

Instale o Node.js 22 ou superior. Depois, abra o PowerShell dentro da pasta do projeto e execute:

```powershell
npm install
Copy-Item .env.example .env.local
```

Preencha o `.env.local` conforme a seção abaixo antes de iniciar.

## Configuração das integrações

Abra o arquivo `.env.local` criado no passo anterior e preencha:

- `SHOPEE_APP_ID` e `SHOPEE_SECRET`: credenciais da Shopee Affiliate Open API;
- `ML_CLIENT_ID`: ID do aplicativo no Mercado Livre;
- `ML_CLIENT_SECRET`: chave secreta do aplicativo;
- `ML_REDIRECT_URI`: a mesma URI HTTPS cadastrada no portal do Mercado Livre;
- `AFFILIATE_TAG` e `ML_AFFILIATE_COOKIE`: os mesmos dados já usados pelo Auvello para gerar links afiliados;
- `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET` e `AMAZON_CREATORS_CREDENTIAL_VERSION`: credenciais da Amazon Creators API;
- `AMAZON_PARTNER_TAG`: ID de rastreamento da sua conta de Associado Amazon Brasil;
- `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`: dados da WhatsApp Cloud API da Meta.

Não coloque o token gerado por `client_credentials` em `MERCADO_LIVRE_ACCESS_TOKEN`. A pesquisa por nome usa OAuth com autorização da conta e renovação automática.

## Amazon Creators API

A integração da Amazon usa a Creators API oficial. Entre no Associados Amazon Brasil e acesse **Ferramentas → Creators API**. Crie uma aplicação e uma credencial e preencha no `.env.local`:

```env
AMAZON_CREATORS_CLIENT_ID=SEU_CREDENTIAL_ID
AMAZON_CREATORS_CLIENT_SECRET=SEU_CREDENTIAL_SECRET
AMAZON_CREATORS_CREDENTIAL_VERSION=3.1
AMAZON_PARTNER_TAG=SEU_ID_DE_RASTREAMENTO
AMAZON_MARKETPLACE=www.amazon.com.br
AMAZON_TOKEN_URL=https://api.amazon.com/auth/o2/token
AMAZON_API_URL=https://creatorsapi.amazon/catalog/v1
```

Use exatamente a versão exibida pela Amazon ao criar a credencial. O sistema solicita o token OAuth automaticamente, mantém o token em memória até perto do vencimento e o renova sem intervenção manual. Os links retornados pela API já carregam o Partner Tag e não são alterados pela aplicação.

Caso a Amazon ainda não tenha liberado a Creators API para sua conta, o quadro da loja aparecerá como **aguardando credenciais** e as outras integrações continuarão funcionando normalmente.

## Autorizar o Mercado Livre pela primeira vez

No portal de desenvolvedores do Mercado Livre:

1. mantenha o fluxo **Authorization Code** habilitado;
2. mantenha **Refresh Token** habilitado;
3. habilite **PKCE necessário**;
4. cadastre uma URI de redirecionamento HTTPS, por exemplo `https://localhost/callback`;
5. copie exatamente essa mesma URI para `ML_REDIRECT_URI` no `.env.local`.

Depois execute:

```powershell
npm run ml:auth
```

O navegador abrirá a autorização. Depois de permitir o acesso, a página de `localhost` pode não carregar; isso é esperado porque não existe um servidor HTTPS nesse endereço. Copie a URL completa da barra do navegador, volte ao PowerShell, cole e pressione **Enter**.

O projeto salvará o `access_token` e o `refresh_token` em um arquivo local ignorado pelo Git. Não compartilhe esse arquivo. Quando o access token expirar, o serviço local fará a renovação automaticamente.

## Links afiliados do Mercado Livre

O Mercado Livre não devolve o link afiliado junto da busca. Este projeto pode enviar os links encontrados ao mesmo gerador usado pelo portal de afiliados e substituir o endereço normal pelo `meli.la` retornado.

No `.env.local`, preencha:

```env
AFFILIATE_MODE=portal
AFFILIATE_TAG=SUA_TAG
AFFILIATE_CREATE_URL=https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink
ML_AFFILIATE_COOKIE=COOKIE_DA_SUA_SESSAO
ML_AFFILIATE_USER_AGENT=Mozilla/5.0
```

Esses são os mesmos nomes de configuração do projeto Auvello. Também são aceitos `ML_AFFILIATE_TAG` e `ML_AFFILIATE_CREATE_URL` para compatibilidade com a versão anterior deste comparador; quando os dois formatos estiverem preenchidos, o nome iniciado por `ML_` tem prioridade.

Para localizar os dados da sua própria sessão:

1. entre no portal de afiliados do Mercado Livre;
2. abra as ferramentas do desenvolvedor do navegador (`F12`);
3. na guia **Network/Rede**, gere manualmente um link afiliado;
4. abra a requisição chamada `createLink`;
5. copie sua tag e o valor completo do cabeçalho `Cookie` para o `.env.local`.

O cookie é sensível e pode expirar. Nunca envie esse valor para outra pessoa. Esse gerador pertence ao portal web e pode mudar. Se ele estiver ausente ou indisponível, a página mantém o link normal e mostra o motivo no quadro do Mercado Livre.

Para testar separadamente com um link normal do Mercado Livre:

```powershell
npm run ml:affiliate:test -- "COLE_AQUI_O_LINK_NORMAL"
```

Se estiver configurado corretamente, o terminal mostrará `Link afiliado gerado com sucesso` seguido do endereço `meli.la`.

## Pesquisa por nome no Mercado Livre

A busca tenta o nome original e variações simplificadas sem conectores. Para itens automotivos como `tapete de fusca`, também tenta formas como `tapete fusca`, `tapete automotivo fusca` e `jogo tapetes fusca`. Os resultados são reunidos sem repetir o mesmo produto e até 10 ofertas de cada loja são exibidas.

## Iniciar a página

Depois da autorização, execute:

```powershell
npm run dev
```

Esse comando inicia a página e o serviço local que renova o token. Abra `http://localhost:5173` no navegador.

Se alterar o `.env.local`, encerre com `Ctrl+C` e execute `npm run dev` novamente.

## Publicar gratuitamente no Render

Este projeto usa o mesmo modelo do Auvello: um **Render Free Web Service** conectado ao GitHub e o **Neon PostgreSQL** para manter os tokens OAuth do Mercado Livre mesmo depois de reinícios.

### 1. Criar o banco no Neon

Crie um projeto gratuito no Neon, abra **Connection details** e copie a connection string completa. Ela será usada como `DATABASE_URL`. A tabela necessária é criada automaticamente na primeira autorização.

### 2. Criar o serviço no Render

No Render, escolha **New → Blueprint**, conecte o repositório `auvellosystem/garimpo` e selecione o arquivo `render.yaml`. O Render usará o `Dockerfile` incluído no projeto. Quando solicitado, preencha as variáveis secretas.

Depois que o serviço for criado, copie o endereço público fornecido pelo Render. Exemplo:

```text
https://garimpo.onrender.com
```

No aplicativo do Mercado Livre, cadastre como URI de redirect:

```text
https://garimpo.onrender.com/callback
```

Use o endereço real fornecido pelo Render, acrescido de `/callback`. Coloque exatamente o mesmo valor na variável `ML_REDIRECT_URI` do Render e no `.env.local` do computador.

### 3. Variáveis essenciais no Render

Cadastre em **Environment**:

```env
DATABASE_URL=CONNECTION_STRING_DO_NEON
ML_CLIENT_ID=ID_DO_APLICATIVO
ML_CLIENT_SECRET=CHAVE_SECRETA
ML_REDIRECT_URI=https://SEU-SERVICO.onrender.com/callback
MERCADO_LIVRE_TOKEN_SERVICE_URL=http://127.0.0.1:8788/token
ML_TOKEN_SERVICE_PORT=8788
SHOPEE_APP_ID=ID_DA_SHOPEE
SHOPEE_SECRET=SEGREDO_DA_SHOPEE
AFFILIATE_MODE=portal
AFFILIATE_TAG=SUA_TAG
ML_AFFILIATE_COOKIE=SEU_COOKIE
```

As variáveis da Amazon e do WhatsApp continuam opcionais. Não envie o arquivo `.env.local` ao GitHub.

### 4. Autorizar o Mercado Livre no Neon

No `.env.local` do computador, use a mesma `DATABASE_URL`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` cadastradas no Render. Execute:

```powershell
npm run ml:auth
```

Autorize no navegador, copie a URL completa da página `/callback`, cole no PowerShell e pressione **Enter**. O comando gravará o access token e o refresh token diretamente no Neon. A partir daí, o serviço do Render renovará os tokens automaticamente.

### 5. Enviar a atualização

```powershell
git add .
git commit -m "Prepara deploy gratuito no Render"
git push
```

Cada novo `git push` na branch principal inicia uma nova publicação automaticamente no Render.

### Importante sobre o WhatsApp

Mensagens de texto livres pela Cloud API normalmente dependem de uma janela de atendimento aberta pelo cliente. Fora dessa janela, a Meta exige um modelo de mensagem previamente aprovado. Enquanto a automação não estiver habilitada, o sistema usa o modo seguro: abre a conversa com o texto pronto e você confirma o envio.

### Importante sobre afiliados

A Shopee entrega `offerLink` pela API de afiliados e esse é o link usado pela página. A Amazon entrega `detailPageURL` já vinculado ao Partner Tag informado. A busca do Mercado Livre entrega o link normal do anúncio e o projeto tenta convertê-lo pelo gerador configurado no `.env.local`.

## Uso

1. Digite o nome do produto, como `pipoqueira`, `League of Legends` ou `tapete de fusca`.
   - Como alternativa, selecione **Link do Mercado Livre** e cole o endereço de um anúncio/produto ou um ID `MLB...`.
2. Informe um WhatsApp com DDD, se quiser receber a mensagem.
3. Clique em **Buscar e enviar ofertas**.
4. Confira os resultados e abra a oferta desejada.

Os valores e a disponibilidade são consultados no momento da busca, mas devem ser confirmados na loja antes da compra.
