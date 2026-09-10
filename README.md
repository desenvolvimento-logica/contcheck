# Balance Check

Prompt Final

Aja como um especialista em desenvolvimento de aplicações web no Lovable, com experiência em sistemas contábeis, leitura de PDFs estruturados, validação de regras financeiras e criação de interfaces enterprise minimalistas.

Sua tarefa é criar uma aplicação web para análise de relatórios contábeis exportados do sistema Domínio.

A aplicação terá duas finalidades principais:

 Comparar Lançamentos Contábeis

 Analisar Saldo Invertido

A interface deve ter um visual enterprise, minimalista e profissional, usando branco e cinza como cores principais, com amarelo nos detalhes, alertas e elementos de destaque.

A aplicação deve ter uma tela inicial simples, com:

 Título da aplicação

 Breve descrição do objetivo

 Dois botões ou cards de seleção:

 Comparar Lançamentos Contábeis

 Analisar Saldo Invertido

 Após o usuário escolher o tipo de análise, exibir o campo de upload do arquivo PDF correspondente

 O upload deve aceitar apenas arquivos em PDF

 Após o upload, a aplicação deve processar o arquivo e mostrar os resultados da análise em cards

Funcionalidade 1: Comparar Lançamentos Contábeis

Quando o usuário selecionar “Comparar Lançamentos Contábeis”, ele deverá fazer upload de um PDF com a seguinte estrutura de colunas:

 Código

 Classificação

 Descrição

 Mês 1

 Mês 2

 Mês 3

 Saldo Acumulado

A aplicação deve analisar os valores das colunas:

 Mês 1

 Mês 2

 Mês 3

A classificação padrão para análise deve ser:

3.1.1.02.002

Porém, a aplicação também deve permitir que o usuário informe manualmente outra classificação para comparação, antes ou depois de fazer o upload do PDF.

A aplicação deve localizar no PDF a linha correspondente à classificação informada.

Depois disso, deve comparar:

 Mês 1 x Mês 2

 Mês 2 x Mês 3

A regra de comparação é:

 Se a diferença percentual entre os meses for maior que 30% ou menor que -30%, a aplicação deve considerar como divergência.

 Se a diferença percentual estiver entre -30% e +30%, a aplicação deve considerar como normal.

Use a seguinte lógica para calcular a variação percentual:

Diferença percentual = ((valor do mês atual - valor do mês anterior) / valor absoluto do mês anterior) x 100

Exemplo:

 Se Mês 1 for 100 e Mês 2 for 128, a variação é de 28%, então está normal.

 Se Mês 2 for 100 e Mês 3 for 140, a variação é de 40%, então existe divergência.

Quando houver divergência, a aplicação deve mostrar um card de atenção contendo:

 Comparação analisada

 Percentual encontrado

 Valor da diferença entre os meses

Exemplo de mensagem:

“Atenção: variação de 40% entre Mês 2 e Mês 3. Diferença encontrada: R$ 40,00.”

O card deve ter destaque visual com detalhe em amarelo.

Se não houver divergências, mostrar um card informando:

“Nenhuma divergência superior a 30% foi encontrada para a classificação analisada.”

Também exiba um pequeno resumo da análise contendo:

 Classificação analisada

 Valor do Mês 1

 Valor do Mês 2

 Valor do Mês 3

 Resultado da comparação Mês 1 x Mês 2

 Resultado da comparação Mês 2 x Mês 3

Funcionalidade 2: Analisar Saldo Invertido

Quando o usuário selecionar “Analisar Saldo Invertido”, ele deverá fazer upload de um novo PDF com a seguinte estrutura de colunas:

 Código

 Classificação

 Descrição da conta

 Saldo anterior

 Débito

 Crédito

 Saldo Atual

A aplicação deve analisar todas as linhas do relatório, considerando as colunas:

 Classificação

 Saldo Atual

A primeira regra é validar a natureza do saldo conforme a classificação contábil:

 Caso a classificação inicie com 1 ou 3, o último caractere do campo Saldo Atual deve ser a letra D.

 Caso a classificação inicie com 2 ou 4, o último caractere do campo Saldo Atual deve ser a letra C.

Se alguma linha descumprir essa regra, a aplicação deve exibir um card de divergência contendo:

 Classificação

 Saldo Atual encontrado

 Regra esperada

Exemplos:

“Divergência encontrada: a classificação 1.1.1.01.001 deveria terminar com saldo D, mas o Saldo Atual encontrado foi R$ 500,00 C.”

“Divergência encontrada: a classificação 2.1.1.01.001 deveria terminar com saldo C, mas o Saldo Atual encontrado foi R$ 300,00 D.”

A segunda regra é identificar saldos baixos:

A aplicação deve verificar os valores numéricos da coluna Saldo Atual, desconsiderando a letra final D ou C.

Caso o valor numérico do Saldo Atual seja maior que 0 e menor que 10, a aplicação deve exibir um card de atenção contendo:

 Classificação

 Saldo Atual encontrado

Exemplo:

“Atenção: saldo atual baixo identificado. Classificação: 1.1.1.01.001. Saldo Atual: R$ 7,50 D.”

A aplicação deve separar visualmente os resultados em duas seções:

 Saldos com natureza invertida

 Saldos atuais maiores que 0 e menores que 10

Se nenhuma divergência for encontrada, mostrar um card informando:

“Nenhum saldo invertido foi encontrado.”

Se nenhum saldo baixo for encontrado, mostrar um card informando:

“Nenhum saldo atual entre R$ 0,01 e R$ 9,99 foi encontrado.”

Requisitos de leitura e tratamento dos PDFs

Os PDFs sempre serão relatórios padronizados exportados do sistema Domínio.

A aplicação deve extrair corretamente os dados tabulares do PDF, respeitando as colunas esperadas para cada tipo de análise.

A aplicação deve tratar valores monetários no formato brasileiro, por exemplo:

 1.234,56

 R$ 1.234,56

 1.234,56D

 1.234,56C

 0,00

 7,50D

A aplicação deve converter os valores para número quando necessário, removendo:

 R$

 pontos de milhar

 vírgula decimal

 espaços

 letras D ou C no final, quando for preciso calcular valores

A aplicação deve preservar a letra D ou C quando for necessário validar a natureza do saldo.

Caso o arquivo PDF enviado não tenha a estrutura esperada, mostrar uma mensagem clara:

“Não foi possível identificar a estrutura esperada no PDF. Verifique se o arquivo corresponde ao tipo de análise selecionado.”

Requisitos de interface

Crie uma interface enterprise minimalista com:

 Fundo branco ou cinza muito claro

 Cards com bordas suaves

 Tipografia limpa e profissional

 Amarelo nos detalhes, ícones de alerta, bordas de destaque e botões principais

 Layout responsivo para desktop e notebook

 Botões claros e objetivos

 Estados visuais para:

 Aguardando upload

 Processando arquivo

 Análise concluída

 Erro no arquivo

 Nenhuma divergência encontrada

 Divergências encontradas

A tela de resultados deve ser objetiva e fácil de interpretar.

Evite gráficos complexos. Priorize cards, tabelas simples e mensagens claras.

Fluxo esperado do usuário

 O usuário acessa a aplicação.

 Escolhe entre:

 Comparar Lançamentos Contábeis

 Analisar Saldo Invertido

 A aplicação mostra o campo de upload correspondente.

 No caso de “Comparar Lançamentos Contábeis”, a aplicação também mostra o campo de classificação, preenchido por padrão com 3.1.1.02.002.

 O usuário envia o PDF.

 A aplicação processa o arquivo.

 A aplicação mostra os cards de resultado conforme as regras.

 O usuário pode trocar o tipo de análise ou enviar outro arquivo.

Critérios de sucesso

A aplicação estará correta quando:

 Permitir escolher entre os dois tipos de análise.

 Aceitar upload de PDF.

 Ler corretamente relatórios padronizados do sistema Domínio.

 Comparar Mês 1 x Mês 2 e Mês 2 x Mês 3.

 Alertar apenas quando a variação for superior a 30% ou inferior a -30%.

 Permitir alterar a classificação analisada na comparação de lançamentos.

 Validar saldo invertido conforme o primeiro número da classificação.

 Identificar saldos atuais maiores que 0 e menores que 10.

 Mostrar os resultados em cards claros, objetivos e visualmente profissionais.

 Usar visual enterprise minimalista em branco, cinza e amarelo.

 Não gerar relatórios para download em PDF ou Excel.

Pense passo a passo na arquitetura da aplicação antes de implementar. Crie os componentes necessários, organize bem a lógica de extração e validação dos dados, e entregue uma aplicação funcional, responsiva e fácil de usar.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://contcheck.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e546c389-2fd9-45ce-bb29-541712c35802).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
