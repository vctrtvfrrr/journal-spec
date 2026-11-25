# Evolução aditiva do contrato e versão mínima pelo major

Clients publicados (Android, TUI, PWA) ficam rodando versões antigas por tempo indeterminado, então a API precisa atender o contrato de todo Client ainda suportado. Decidimos que o contrato evolui só de forma aditiva, que remover algo exige deprecação seguida de um major, e que o major define a versão mínima aceita: com o contrato em `X.y.z`, a API aceita Clients a partir de `X.0.0`.

## Opções consideradas

- **Quebra com bump de major e a API servindo vários majors ao mesmo tempo** (ex.: `/v1` e `/v2`): rejeitada, porque manter duas superfícies é caro demais para um Journal de um só owner.
- **Só aditiva, para sempre, sem versão mínima**: rejeitada, porque nada poderia ser removido.
- **Versão mínima configurada à parte na API**: rejeitada, porque derivar do major dá o mesmo resultado sem uma segunda fonte de verdade.

## Consequências

- Todo request e toda response levam o header `Contract-Version`. Na request, é a versão do contrato com que o Client foi gerado; na response, é a da API. Na request ele é obrigatório desde o início, porque nenhum Client foi publicado antes desta decisão.
- A checagem de versão vem antes de qualquer outra, inclusive autenticação, 404, 405 e 415. Assim um Client antigo com token revogado vê "atualize" e não "faça login".
- Um Client abaixo do mínimo, ou com o header ausente ou malformado, recebe 400 com o problem `ContractVersionProblem`: `type` fixo `tag:journal,2026:contract-version-unsupported` e a extensão `minimum_version`. Os demais problems continuam `about:blank`. Não usamos 426: o RFC 9110 reserva esse status para troca de protocolo e exige o header `Upgrade`.
- Um Client mais novo que a API é aceito. Por isso a API faz deploy antes dos Clients.
- Os Clients precisam ignorar campos desconhecidos nas responses (leitor tolerante). Sem isso, adicionar um campo de response seria uma quebra.
- Enums que aparecem em responses ficam congelados: um valor novo é quebra e só entra num major. A alternativa, enums extensíveis com fallback obrigatório em todo Client, foi rejeitada pelo custo de manter esse fallback nos três Clients.
- Versionamento: patch muda só docs e exemplos, minor só adiciona, major abandona Clients antigos.
- Enquanto o contrato estiver em `0.x`, quebras são livres, desde que venham com pelo menos um bump de minor, e o mínimo não se aplica. O primeiro Client publicado marca o `1.0.0`.
