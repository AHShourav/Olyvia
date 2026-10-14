from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0002_nutrients_and_foodlog'),
        ('accounts', '0002_userprofile_age_userprofile_condition_rules_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='nutrition_rules',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='profile_avatar',
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='FoodLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('food_name', models.CharField(max_length=255)),
                ('source', models.CharField(choices=[('voice', 'Voice'), ('barcode', 'Barcode'), ('image', 'Image'), ('manual', 'Manual')], max_length=16)),
                ('barcode', models.CharField(blank=True, default='', max_length=32)),
                ('nutrients', models.JSONField(blank=True, default=dict)),
                ('logged_at', models.DateTimeField(auto_now_add=True)),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='food_logs', to='products.product')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='food_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-logged_at'],
            },
        ),
    ]
