# EnglishTutor – Azure deployment

`main.bicep` creates everything the classroom app needs, on always-free tiers
(see [`docs/azure-plan.md`](../docs/azure-plan.md) for the reasons):

| Resource | Name | Notes |
|---|---|---|
| Static Web App, Free plan | `swa-englishtutor` | Frontend + managed Functions API. Pull-request previews are disabled, because they would use the production database. |
| Cosmos DB account, free tier | `cosmos-englishtutor-<suffix>` | Account throughput limited to 1000 RU/s, continuous 7-day backup (no storage charge), keys can't create or delete containers. |
| Database | `englishtutor` | 1000 RU/s shared by its containers. |
| Container | `progress` | One document per pupil, partition key `/id`, the `data` field isn't indexed. |

Commands below are for Git Bash (or any bash). In PowerShell, quoting JSON for `az` is unreliable, so set
`PUPILS_JSON` in the portal instead (step 4).

## 1. Subscription, resource group, budget (once)

1. Create an Azure subscription. A free account is **disabled after 30 days unless it is upgraded to
   pay-as-you-go**; upgrade it before day 30. The always-free tiers used here stay at €0 after the upgrade.
2. Sign in and create the resource group in West Europe:

   ```bash
   az login
   az group create --name rg-englishtutor --location westeurope
   ```
3. In the portal: **Cost Management → Budgets → Add**, scope `rg-englishtutor` (or the whole subscription),
   amount **€1 per month**, alert at 100 % of the actual cost to your e-mail address. A budget only sends
   e-mails, with a few hours' delay; it stops nothing.

## 2. Deploy the resources

```bash
az deployment group create --resource-group rg-englishtutor --template-file infra/main.bicep
```

The deployment is idempotent; run it again after changing `main.bicep`. Preview a change with
`az deployment group what-if` and the same arguments.

The Cosmos free tier can be used by **one account per subscription**, and only when the account is created.
If the deployment fails with a free-tier error, another account in the subscription already uses it.

Check in the portal that the Cosmos DB account's **Overview** shows *Free Tier Discount: Opted In*.

## 3. The API's settings

The API reads three environment variables (see [`classroom/README.md`](../classroom/README.md#login)). They are
encrypted at rest and only the API can read them. **Never commit them: the repository is public.**

The Cosmos DB connection string, straight from the account:

```bash
COSMOS_ACCOUNT=$(az deployment group show --resource-group rg-englishtutor --name main --query properties.outputs.cosmosAccountName.value --output tsv)
COSMOS=$(az cosmosdb keys list --resource-group rg-englishtutor --name "$COSMOS_ACCOUNT" --type connection-strings --query "connectionStrings[0].connectionString" --output tsv)
az staticwebapp appsettings set --name swa-englishtutor --resource-group rg-englishtutor --setting-names "COSMOS_CONNECTION_STRING=$COSMOS"
```

The passwords are best typed in the portal, so they don't end up in the shell history:
**Static Web App → Settings → Environment variables → Production → + Add**:

* `TEACHER_PASSWORD`: a long password (at least 8 letters or digits).
* `PUPILS_JSON`: the whole list on one line, for example
  `[{"id":"p01","name":"Anna","password":"piros-roka-7"},{"id":"p02","name":"Bence","password":"kek-bagoly-3"}]`.
  Keep the list with the real passwords outside the repository.

Select **Apply**. The API restarts with the new values; changing a pupil's password logs that pupil out on
every device, while their progress (stored by `id`) stays. Problems in the list are written to the API's log
and shown in the teacher's view.

## 4. Connect GitHub

The workflow `.github/workflows/azure-static-web-apps.yml` deploys with the Static Web App's deployment
token. Store it as the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`:

```bash
az staticwebapp secrets list --name swa-englishtutor --resource-group rg-englishtutor --query properties.apiKey --output tsv
```

Copy the output to GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
Then push to `master` (or run the workflow by hand from the **Actions** tab). The app's address is the
`staticWebAppUrl` output of the deployment, also shown on the Static Web App's **Overview** page.

If the token leaks, reset it with `az staticwebapp secrets reset-api-key` and update the secret.

## Don't create

Key Vault, App Service plans, Container Registry, Front Door: none of them is free. If you enable
Application Insights later, set a daily cap on its Log Analytics workspace.
